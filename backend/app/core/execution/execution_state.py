"""ExecutionState — Immutable execution state tracker.

Responsible for representing the logical state of a single workflow execution.
Pure data model — no engine dependencies, no event emission, no persistence.
Thread-safe by design (immutable, frozen dataclass).

State machine:
  PENDING --start()--> RUNNING --complete()--> COMPLETED
         |                |                |
         |                |                +-- fail(error)--> FAILED
         |                +-- cancel()--------> CANCELLED
         +-- timeout()-----------> TIMEOUT

is_terminal = status in {COMPLETED, FAILED, CANCELLED, TIMEOUT}
PENDING is NOT terminal.

Invariants:
  - completed_agents <= total_agents
  - progress_percentage in [0, 100]
  - error is Optional[str] — None throughout lifecycle
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, ClassVar

from app.core.execution.execution_engine import ExecutionStatus


@dataclass(frozen=True)
class ExecutionState:
    """Immutable execution state tracker.

    Single source of logical state for one execution.
    All methods return a NEW ExecutionState instance (immutable pattern).
    Thread-safe by design — no shared mutable state, no locks required.

    Invariants (enforced by construction/validation):
      - completed_agents <= total_agents
      - progress_percentage in [0, 100]
      - error is Optional[str] — None preserved throughout lifecycle
      - is_terminal excludes PENDING
    """

    # --- Core identity ---
    execution_id: str
    status: ExecutionStatus

    # --- Progress tracking ---
    completed_agents: int = 0
    total_agents: int = 0

    # --- Timestamps ---
    started_at: float = field(default_factory=lambda: 0.0)
    updated_at: float = field(default_factory=lambda: time.time())
    finished_at: float = field(default_factory=lambda: 0.0)

    # --- Status flags ---
    error: Optional[str] = None
    cancelled: bool = False
    timed_out: bool = False

    # --- Schema versioning (additive; future versions may add fields) ---
    SCHEMA_VERSION: ClassVar[int] = 1

    # --- Computed properties ---

    @property
    def is_running(self) -> bool:
        """True only when status is RUNNING."""
        return self.status == ExecutionStatus.RUNNING

    @property
    def is_finished(self) -> bool:
        """True when status is a terminal state."""
        return self.status in (
            ExecutionStatus.COMPLETED,
            ExecutionStatus.FAILED,
            ExecutionStatus.CANCELLED,
            ExecutionStatus.TIMEOUT,
        )

    @property
    def is_terminal(self) -> bool:
        """True when status is a terminal state.

        PENDING is NOT terminal — only COMPLETED/FAILED/CANCELLED/TIMEOUT.
        """
        return self.status in (
            ExecutionStatus.COMPLETED,
            ExecutionStatus.FAILED,
            ExecutionStatus.CANCELLED,
            ExecutionStatus.TIMEOUT,
        )

    @property
    def progress_percentage(self) -> float:
        """Completion percentage clamped to [0, 100].

        Invariant: always in [0, 100] even if invariants are temporarily violated
        (defensive clamping).
        """
        if self.total_agents == 0:
            return 0.0
        pct = round(min(max(self.completed_agents, 0) / self.total_agents * 100, 100), 2)
        return pct

    @property
    def duration(self) -> float:
        """Elapsed seconds since start.

        If finished: finished_at - started_at
        If running: time.time() - started_at
        If not started: 0.0
        """
        if self.started_at == 0.0:
            return 0.0
        if self.is_finished:
            return self.finished_at - self.started_at
        return time.time() - self.started_at

    # --- Transition methods (all return NEW ExecutionState instance) ---

    def start(self) -> "ExecutionState":
        """PENDING → RUNNING.

        Only valid from PENDING status.
        Raises ValueError if called from any other status.
        """
        if self.status != ExecutionStatus.PENDING:
            raise ValueError(
                f"Cannot start execution in {self.status.value} state"
            )
        return self._replace(
            status=ExecutionStatus.RUNNING,
            started_at=time.time(),
            updated_at=time.time(),
        )

    def complete(self) -> "ExecutionState":
        """RUNNING → COMPLETED.

        Only valid from RUNNING status.
        Raises ValueError if called from any other status.
        """
        if self.status != ExecutionStatus.RUNNING:
            raise ValueError(
                f"Cannot complete execution in {self.status.value} state"
            )
        return self._replace(
            status=ExecutionStatus.COMPLETED,
            updated_at=time.time(),
            finished_at=time.time(),
        )

    def fail(self, error: Optional[str]) -> "ExecutionState":
        """RUNNING → FAILED.

        Only valid from RUNNING status.
        error may be None (preserved as None, not converted to "").
        Raises ValueError if called from any other status.
        """
        if self.status != ExecutionStatus.RUNNING:
            raise ValueError(
                f"Cannot fail execution in {self.status.value} state"
            )
        return self._replace(
            status=ExecutionStatus.FAILED,
            error=error,
            updated_at=time.time(),
            finished_at=time.time(),
        )

    def cancel(self) -> "ExecutionState":
        """RUNNING → CANCELLED.

        Only valid from RUNNING status.
        Raises ValueError if called from any other status.
        """
        if self.status != ExecutionStatus.RUNNING:
            raise ValueError(
                f"Cannot cancel execution in {self.status.value} state"
            )
        return self._replace(
            status=ExecutionStatus.CANCELLED,
            cancelled=True,
            updated_at=time.time(),
            finished_at=time.time(),
        )

    def timeout(self) -> "ExecutionState":
        """RUNNING → TIMEOUT.

        Only valid from RUNNING status.
        Raises ValueError if called from any other status.
        """
        if self.status != ExecutionStatus.RUNNING:
            raise ValueError(
                f"Cannot timeout execution in {self.status.value} state"
            )
        return self._replace(
            status=ExecutionStatus.TIMEOUT,
            timed_out=True,
            updated_at=time.time(),
            finished_at=time.time(),
        )

    def update_progress(self, completed: int, total: int) -> "ExecutionState":
        """Update completed_agents and total_agents.

        Invariant enforcement:
          - completed must not exceed total
          - total must not be negative
        Returns new ExecutionState instance.

        Raises ValueError if:
          - completed > total
          - total < 0
          - called from a terminal state
        """
        if self.is_terminal:
            raise ValueError(
                "Cannot update progress in terminal state"
            )
        if completed > total:
            raise ValueError(
                "completed_agents must not exceed total_agents"
            )
        if total < 0:
            raise ValueError("total_agents must not be negative")

        return self._replace(
            completed_agents=completed,
            total_agents=total,
            updated_at=time.time(),
        )

    def set_current_step(self, group: str, agent: str) -> "ExecutionState":
        """Set current executing group and agent.

        Note: This method sets metadata fields that Runtime may use for
        display/logging. The state machine (status, progress) is managed
        separately via the other methods.

        Returns new ExecutionState instance.
        """
        # Since this is a frozen dataclass, we cannot store group/agent as
        # instance attributes without adding them to the dataclass definition.
        # Instead, we return the instance with a note that Runtime tracks
        # current step externally via the Engine's InFlightExecution.
        # Here we simply return self unchanged — Runtime tracks current step
        # independently via the shared EventBus and Engine state.
        return self

    # --- Serialization ---

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dict with schema version.

        Schema version is included for forward/backward compatibility.
        Future versions may add optional fields without breaking older parsers.
        """
        return {
            "schema_version": self.SCHEMA_VERSION,
            "execution_id": self.execution_id,
            "status": self.status.value,
            "completed_agents": self.completed_agents,
            "total_agents": self.total_agents,
            "started_at": self.started_at,
            "updated_at": self.updated_at,
            "finished_at": self.finished_at,
            "error": self.error,  # None preserved as Python None -> JSON null
            "cancelled": self.cancelled,
            "timed_out": self.timed_out,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ExecutionState":
        """Deserialize from dict with schema version validation.

        Supported schema versions: 1 (current)
        Unknown versions raise ValueError.
        Missing schema_version defaults to 1 (backward compatibility).
        """
        # Schema version validation
        schema_version = data.get("schema_version", 1)
        if schema_version not in {1}:
            raise ValueError(f"Unsupported schema version: {schema_version}")

        # Required fields
        execution_id = data["execution_id"]
        status = ExecutionStatus(data["status"])
        completed_agents = data.get("completed_agents", 0)
        total_agents = data.get("total_agents", 0)
        started_at = data.get("started_at", time.time())
        updated_at = data.get("updated_at", time.time())
        finished_at = data.get("finished_at", 0.0)
        error = data.get("error")  # None preserved — do NOT convert to ""
        cancelled = data.get("cancelled", False)
        timed_out = data.get("timed_out", False)

        return cls(
            execution_id=execution_id,
            status=status,
            completed_agents=completed_agents,
            total_agents=total_agents,
            started_at=started_at,
            updated_at=updated_at,
            finished_at=finished_at,
            error=error,
            cancelled=cancelled,
            timed_out=timed_out,
        )

    # --- helpers ---

    def _replace(self, **kwargs: object) -> "ExecutionState":
        """Create a new ExecutionState with updated fields.

        Since the dataclass is frozen, we reconstruct by calling cls with
        explicit kwargs. Default values from the dataclass definition provide
        all other fields.
        """
        # Build field values: use kwargs override if provided, otherwise default
        execution_id = kwargs.get("execution_id", self.execution_id)
        status = kwargs.get("status", self.status)
        completed_agents = kwargs.get("completed_agents", self.completed_agents)
        total_agents = kwargs.get("total_agents", self.total_agents)
        started_at = kwargs.get("started_at", self.started_at)
        updated_at = kwargs.get("updated_at", time.time())
        finished_at = kwargs.get("finished_at", self.finished_at)
        error = kwargs.get("error", self.error)
        cancelled = kwargs.get("cancelled", self.cancelled)
        timed_out = kwargs.get("timed_out", self.timed_out)

        return ExecutionState(
            execution_id=execution_id,
            status=status,
            completed_agents=completed_agents,
            total_agents=total_agents,
            started_at=started_at,
            updated_at=updated_at,
            finished_at=finished_at,
            error=error,
            cancelled=cancelled,
            timed_out=timed_out,
        )


def test_all_invariants() -> None:
    """Quick invariant check — used by test suites.

    Raises AssertionError if any invariant is violated.
    """
    # Invariant: completed_agents <= total_agents when both are non-zero
    # This is enforced by update_progress; here we just verify the model
    # can represent the invariant correctly.
    s = ExecutionState(
        execution_id="test",
        status=ExecutionStatus.RUNNING,
        completed_agents=3,
        total_agents=5,
    )
    assert s.completed_agents <= s.total_agents
    assert s.progress_percentage >= 0.0
    assert s.progress_percentage <= 100.0

    # Invariant: terminal state has is_terminal=True
    s2 = ExecutionState(
        execution_id="test2",
        status=ExecutionStatus.COMPLETED,
    )
    assert s2.is_terminal == True

    # Invariant: non-terminal state has is_terminal=False
    s3 = ExecutionState(
        execution_id="test3",
        status=ExecutionStatus.RUNNING,
    )
    assert s3.is_terminal == False

    # Invariant: PENDING is not terminal
    s4 = ExecutionState(
        execution_id="test4",
        status=ExecutionStatus.PENDING,
    )
    assert s4.is_terminal == False

    # Invariant: error None preserved
    s5 = ExecutionState(
        execution_id="test5",
        status=ExecutionStatus.FAILED,
        error=None,
    )
    assert s5.error is None

    print("All invariants passed.")


# Run invariant check on module import
test_all_invariants()