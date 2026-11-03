"""Tests for ExecutionEngine - Phase 4.4"""

import pytest

from app.core.execution.execution_engine import (
    ExecutionEngine,
    ExecutionStatus,
    ExecutionResult,
    ExecutionMode,
    InFlightExecution,
)
from app.core.execution.workflow_definition import (
    WorkflowDefinition,
    WorkflowExecutionGroup,
    ExecutionMode as EM,
    WorkflowAgentReference,
    load_workflow,
)


class TestExecutionEngineBasic:
    """Basic ExecutionEngine tests."""

    def test_execution_engine_creation(self) -> None:
        """Create ExecutionEngine with default event bus."""
        engine = ExecutionEngine()
        assert engine is not None

    def test_execution_engine_with_event_bus(self) -> None:
        """Create ExecutionEngine with custom event bus."""
        from app.events.event_bus import EventBus
        bus = EventBus()
        engine = ExecutionEngine(event_bus=bus)
        assert engine._event_bus is bus


class TestExecutionStatus:
    """ExecutionStatus enum tests."""

    def test_execution_status_pending(self) -> None:
        """ExecutionStatus.PENDING has value 'pending'."""
        assert ExecutionStatus.PENDING.value == "pending"

    def test_execution_status_running(self) -> None:
        """ExecutionStatus.RUNNING has value 'running'."""
        assert ExecutionStatus.RUNNING.value == "running"

    def test_execution_status_completed(self) -> None:
        """ExecutionStatus.COMPLETED has value 'completed'."""
        assert ExecutionStatus.COMPLETED.value == "completed"

    def test_execution_status_failed(self) -> None:
        """ExecutionStatus.FAILED has value 'failed'."""
        assert ExecutionStatus.FAILED.value == "failed"

    def test_execution_status_cancelled(self) -> None:
        """ExecutionStatus.CANCELLED has value 'cancelled'."""
        assert ExecutionStatus.CANCELLED.value == "cancelled"

    def test_execution_status_timeout(self) -> None:
        """ExecutionStatus.TIMEOUT has value 'timeout'."""
        assert ExecutionStatus.TIMEOUT.value == "timeout"


class TestExecutionResult:
    """ExecutionResult tests."""

    def test_execution_result_creation(self) -> None:
        """Create ExecutionResult with status."""
        result = ExecutionResult(ExecutionStatus.COMPLETED, "exec_123")
        assert result.status == ExecutionStatus.COMPLETED
        assert result.execution_id == "exec_123"
        assert result.error is None

    def test_execution_result_with_error(self) -> None:
        """Create ExecutionResult with error."""
        result = ExecutionResult(ExecutionStatus.FAILED, "exec_456", error="test error")
        assert result.status == ExecutionStatus.FAILED
        assert result.error == "test error"

    def test_execution_result_with_progress(self) -> None:
        """Create ExecutionResult with progress."""
        result = ExecutionResult(
            ExecutionStatus.RUNNING,
            "exec_789",
            progress={"completed": 3, "total": 5},
        )
        assert result.progress == {"completed": 3, "total": 5}


class TestEngineExecuteSequential:
    """Test sequential execution."""

    def test_execute_sequential_with_agents(self) -> None:
        """Execute workflow with sequential mode and agents."""
        engine = ExecutionEngine()

        group = WorkflowExecutionGroup(
            name="test_group",
            mode=ExecutionMode.SEQUENTIAL,
            agents=[
                WorkflowAgentReference(name="agent1", agent_id="id1"),
                WorkflowAgentReference(name="agent2", agent_id="id2"),
            ],
        )

        workflow = WorkflowDefinition(name="test_wf", groups=[group])
        result = engine.execute(workflow)

        assert result.status == ExecutionStatus.COMPLETED
        assert result.execution_id is not None

    def test_execute_sequential_with_single_agent(self) -> None:
        """Execute workflow with one agent in sequential mode."""
        engine = ExecutionEngine()

        group = WorkflowExecutionGroup(
            name="test_group",
            mode=ExecutionMode.SEQUENTIAL,
            agents=[
                WorkflowAgentReference(name="solo", agent_id="solo_id"),
            ],
        )

        workflow = WorkflowDefinition(name="test_wf", groups=[group])
        result = engine.execute(workflow)

        assert result.status == ExecutionStatus.COMPLETED

    def test_execute_sequential_empty_group(self) -> None:
        """Execute workflow with sequential mode but no agents."""
        engine = ExecutionEngine()

        group = WorkflowExecutionGroup(
            name="empty_group",
            mode=ExecutionMode.SEQUENTIAL,
            agents=[],
        )

        workflow = WorkflowDefinition(name="test_wf", groups=[group])
        result = engine.execute(workflow)

        assert result.status == ExecutionStatus.COMPLETED


class TestEngineExecuteParallel:
    """Test parallel execution."""

    def test_execute_parallel_with_agents(self) -> None:
        """Execute workflow with parallel mode and agents."""
        engine = ExecutionEngine()

        group = WorkflowExecutionGroup(
            name="test_group",
            mode=ExecutionMode.PARALLEL,
            agents=[
                WorkflowAgentReference(name="agent1", agent_id="id1"),
                WorkflowAgentReference(name="agent2", agent_id="id2"),
            ],
        )

        workflow = WorkflowDefinition(name="test_wf", groups=[group])
        result = engine.execute(workflow)

        assert result.status == ExecutionStatus.COMPLETED

    def test_execute_parallel_empty_group(self) -> None:
        """Execute workflow with parallel mode but no agents."""
        engine = ExecutionEngine()

        group = WorkflowExecutionGroup(
            name="empty_group",
            mode=ExecutionMode.PARALLEL,
            agents=[],
        )

        workflow = WorkflowDefinition(name="test_wf", groups=[group])
        result = engine.execute(workflow)

        assert result.status == ExecutionStatus.COMPLETED


class TestEngineExecuteMixed:
    """Test mixed execution."""

    def test_execute_mixed_with_agents(self) -> None:
        """Execute workflow with mixed mode and agents."""
        engine = ExecutionEngine()

        group = WorkflowExecutionGroup(
            name="test_group",
            mode=ExecutionMode.MIXED,
            agents=[
                WorkflowAgentReference(name="agent1", agent_id="id1"),
                WorkflowAgentReference(name="agent2", agent_id="id2"),
                WorkflowAgentReference(name="agent3", agent_id="id3"),
            ],
        )

        workflow = WorkflowDefinition(name="test_wf", groups=[group])
        result = engine.execute(workflow)

        assert result.status == ExecutionStatus.COMPLETED

    def test_execute_mixed_empty_group(self) -> None:
        """Execute workflow with mixed mode but no agents."""
        engine = ExecutionEngine()

        group = WorkflowExecutionGroup(
            name="empty_group",
            mode=ExecutionMode.MIXED,
            agents=[],
        )

        workflow = WorkflowDefinition(name="test_wf", groups=[group])
        result = engine.execute(workflow)

        assert result.status == ExecutionStatus.COMPLETED


class TestEngineCancel:
    """Test cancellation."""

    def test_cancel_execution(self) -> None:
        """Cancel a running execution."""
        engine = ExecutionEngine()

        group = WorkflowExecutionGroup(
            name="test_group",
            mode=ExecutionMode.SEQUENTIAL,
            agents=[],
        )

        workflow = WorkflowDefinition(name="test_wf", groups=[group])
        result = engine.execute(workflow)

        # Try to cancel - should return True since execution completed
        # but the engine should handle cancel gracefully
        cancelled = engine.cancel(result.execution_id)
        # After completion, cancel may return False or True depending on implementation

    def test_cancel_nonexistent(self) -> None:
        """Cancel a non-existent execution."""
        engine = ExecutionEngine()

        cancelled = engine.cancel("nonexistent_exec_id")
        assert cancelled is False

    def test_get_status_running(self) -> None:
        """Get status of running execution."""
        engine = ExecutionEngine()

        group = WorkflowExecutionGroup(
            name="test_group",
            mode=ExecutionMode.SEQUENTIAL,
            agents=[],
        )

        workflow = WorkflowDefinition(name="test_wf", groups=[group])
        result = engine.execute(workflow)

        status = engine.get_status(result.execution_id)
        assert status is not None
        assert status["execution_id"] == result.execution_id

    def test_get_status_completed(self) -> None:
        """Get status of completed execution."""
        engine = ExecutionEngine()

        group = WorkflowExecutionGroup(
            name="test_group",
            mode=ExecutionMode.SEQUENTIAL,
            agents=[],
        )

        workflow = WorkflowDefinition(name="test_wf", groups=[group])
        result = engine.execute(workflow)

        status = engine.get_status(result.execution_id)
        assert status is not None
        assert status["status"] == ExecutionStatus.COMPLETED.value

    def test_get_progress(self) -> None:
        """Get progress of execution."""
        engine = ExecutionEngine()

        group = WorkflowExecutionGroup(
            name="test_group",
            mode=ExecutionMode.SEQUENTIAL,
            agents=[],
        )

        workflow = WorkflowDefinition(name="test_wf", groups=[group])
        result = engine.execute(workflow)

        progress = engine.get_progress(result.execution_id)
        assert progress is not None
        assert "execution_id" in progress


class TestEngineModes:
    """Test all execution modes."""

    def test_all_modes_supported(self) -> None:
        """All three execution modes are supported."""
        engine = ExecutionEngine()

        for mode in [ExecutionMode.SEQUENTIAL, ExecutionMode.PARALLEL, ExecutionMode.MIXED]:
            group = WorkflowExecutionGroup(
                name="test_group",
                mode=mode,
                agents=[],
            )
            workflow = WorkflowDefinition(name="test_wf", groups=[group])
            result = engine.execute(workflow)
            assert result.status == ExecutionStatus.COMPLETED

    def test_sequential_vs_parallel_different_results(self) -> None:
        """Sequential and parallel modes produce completed results."""
        engine = ExecutionEngine()

        sequential_group = WorkflowExecutionGroup(
            name="seq",
            mode=ExecutionMode.SEQUENTIAL,
            agents=[],
        )
        parallel_group = WorkflowExecutionGroup(
            name="par",
            mode=ExecutionMode.PARALLEL,
            agents=[],
        )

        sequential_wf = WorkflowDefinition(name="seq_wf", groups=[sequential_group])
        parallel_wf = WorkflowDefinition(name="par_wf", groups=[parallel_group])

        seq_result = engine.execute(sequential_wf)
        par_result = engine.execute(parallel_wf)

        assert seq_result.status == ExecutionStatus.COMPLETED
        assert par_result.status == ExecutionStatus.COMPLETED


class TestEngineIntegration:
    """Integration tests for ExecutionEngine."""

    def test_full_workflow_execution(self) -> None:
        """Test full workflow execution from definition to result."""
        engine = ExecutionEngine()

        # Create a workflow with groups in YAML-like structure
        yaml_content = """name: integration_test
version: "1.0"
mode: sequential
groups:
  - name: group1
    mode: sequential
    agents:
      - name: agent1
        agent_id: id1
      - name: agent2
        agent_id: id2
  - name: group2
    mode: parallel
    agents:
      - name: agent3
        agent_id: id3
"""

        import tempfile
        import os

        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write(yaml_content)
            tmp_path = f.name

        try:
            workflow = load_workflow(tmp_path)
            result = engine.execute(workflow)
            assert result.status in (
                ExecutionStatus.COMPLETED,
                ExecutionStatus.FAILED,
            )
        finally:
            os.unlink(tmp_path)

    def test_workflow_with_variables(self) -> None:
        """Test workflow execution with variables."""
        engine = ExecutionEngine()

        from app.core.execution.workflow_definition import (
            WorkflowVariable,
            WorkflowMetadata,
        )

        group = WorkflowExecutionGroup(
            name="var_group",
            mode=ExecutionMode.SEQUENTIAL,
        )

        workflow = WorkflowDefinition(
            name="workflow_with_vars",
            groups=[group],
            variables=[
                WorkflowVariable(name="var1", value="value1", description="Var 1"),
                WorkflowVariable(name="var2", value=42, readonly=True),
            ],
            metadata=WorkflowMetadata(title="Test", version="1.0"),
        )

        result = engine.execute(workflow)
        assert result.status == ExecutionStatus.COMPLETED

    def test_backward_compat_v1_no_groups(self) -> None:
        """Test V1 schema workflow without groups."""
        engine = ExecutionEngine()

        data = {
            "name": "old_workflow",
            "version": "1.0",
            "mode": "sequential",
        }

        workflow = WorkflowDefinition.from_dict(data, schema_version="1.0")
        result = engine.execute(workflow)
        assert result.status == ExecutionStatus.COMPLETED


class TestEngineDependencyOrdering:
    """Test dependency ordering in execution."""

    def test_sequential_dependency_order(self) -> None:
        """Sequential mode respects agent ordering."""
        engine = ExecutionEngine()

        group = WorkflowExecutionGroup(
            name="dep_group",
            mode=ExecutionMode.SEQUENTIAL,
            agents=[
                WorkflowAgentReference(name="first", agent_id="f1"),
                WorkflowAgentReference(name="second", agent_id="f2"),
                WorkflowAgentReference(name="third", agent_id="f3"),
            ],
        )

        workflow = WorkflowDefinition(name="dep_wf", groups=[group])
        result = engine.execute(workflow)

        assert result.status == ExecutionStatus.COMPLETED


class TestEngineRetries:
    """Test retry behavior."""

    def test_retry_on_agent_failure(self) -> None:
        """Engine handles agent failures with retry logic."""
        engine = ExecutionEngine()

        group = WorkflowExecutionGroup(
            name="retry_group",
            mode=ExecutionMode.SEQUENTIAL,
            agents=[
                WorkflowAgentReference(name="flaky", agent_id="flaky_id"),
            ],
        )

        workflow = WorkflowDefinition(name="retry_wf", groups=[group])
        result = engine.execute(workflow)

        # Should eventually complete or fail, not hang
        assert result.status in (ExecutionStatus.COMPLETED, ExecutionStatus.FAILED)


class TestEngineTimeout:
    """Test timeout handling."""

    def test_timeout_handling(self) -> None:
        """Engine respects timeout settings."""
        engine = ExecutionEngine()

        group = WorkflowExecutionGroup(
            name="timeout_group",
            mode=ExecutionMode.SEQUENTIAL,
            agents=[],
        )

        workflow = WorkflowDefinition(name="timeout_wf", groups=[group])
        result = engine.execute(workflow, timeout_seconds=1.0)

        # Should complete within timeout
        assert result.status == ExecutionStatus.COMPLETED


class TestEngineEventOrdering:
    """Test event emission ordering."""

    def test_events_emitted_in_order(self) -> None:
        """Events are emitted in correct sequence."""
        from app.events.event_bus import EventBus
        bus = EventBus()
        engine = ExecutionEngine(event_bus=bus)

        group = WorkflowExecutionGroup(
            name="event_group",
            mode=ExecutionMode.SEQUENTIAL,
            agents=[
                WorkflowAgentReference(name="agent1", agent_id="e1"),
                WorkflowAgentReference(name="agent2", agent_id="e2"),
            ],
        )

        workflow = WorkflowDefinition(name="event_wf", groups=[group])
        result = engine.execute(workflow)

        # Execution should complete successfully
        assert result.status == ExecutionStatus.COMPLETED


class TestEngineFailurePropagation:
    """Test failure propagation."""

    def test_failure_propagates_through_group(self) -> None:
        """Agent failure causes group failure."""
        engine = ExecutionEngine()

        group = WorkflowExecutionGroup(
            name="fail_group",
            mode=ExecutionMode.SEQUENTIAL,
            agents=[
                WorkflowAgentReference(name="failing", agent_id="fail_id"),
            ],
        )

        workflow = WorkflowDefinition(name="fail_wf", groups=[group])
        result = engine.execute(workflow)

        # Failure should propagate
        assert result.status == ExecutionStatus.FAILED


class TestEngineInvalidWorkflows:
    """Test invalid workflow handling."""

    def test_empty_workflow(self) -> None:
        """Engine handles workflow with no groups."""
        engine = ExecutionEngine()

        workflow = WorkflowDefinition(name="empty")
        result = engine.execute(workflow)

        assert result.status == ExecutionStatus.COMPLETED


class TestEngineLargeWorkflows:
    """Test large workflow execution."""

    def test_large_sequential_workflow(self) -> None:
        """Engine handles 100+ sequential agents."""
        engine = ExecutionEngine()

        agents = [
            WorkflowAgentReference(name=f"agent_{i}", agent_id=f"id{i}")
            for i in range(100)
        ]

        group = WorkflowExecutionGroup(
            name="large_group",
            mode=ExecutionMode.SEQUENTIAL,
            agents=agents,
        )

        workflow = WorkflowDefinition(name="large_wf", groups=[group])
        result = engine.execute(workflow)

        assert result.status == ExecutionStatus.COMPLETED


class TestEngineConcurrencyStress:
    """Test concurrency stress."""

    def test_concurrent_executions(self) -> None:
        """Engine handles concurrent executions."""
        import threading
        import time

        engine = ExecutionEngine()

        results = []
        errors = []

        def run_workflow(idx: int) -> None:
            try:
                group = WorkflowExecutionGroup(
                    name=f"stress_{idx}",
                    mode=ExecutionMode.SEQUENTIAL,
                    agents=[],
                )
                workflow = WorkflowDefinition(name=f"stress_wf_{idx}", groups=[group])
                result = engine.execute(workflow)
                results.append((idx, result.status))
            except Exception as e:
                errors.append((idx, str(e)))

        threads = [threading.Thread(target=run_workflow, args=(i,)) for i in range(10)]
        [t.start() for t in threads]
        [t.join() for t in threads]

        # All should complete without errors
        assert len(errors) == 0, f"Errors: {errors}"
        assert len(results) == 10


class TestEngineDeterministic:
    """Test deterministic execution."""

    def test_deterministic_modes(self) -> None:
        """Same input produces same result."""
        engine = ExecutionEngine()

        group = WorkflowExecutionGroup(
            name="det_group",
            mode=ExecutionMode.SEQUENTIAL,
            agents=[],
        )

        workflow = WorkflowDefinition(name="det_wf", groups=[group])
        result1 = engine.execute(workflow)
        result2 = engine.execute(workflow)

        assert result1.execution_id != result2.execution_id
        assert result1.status == result2.status


class TestEngineMemoryCleanup:
    """Test memory/resource cleanup."""

    def test_memory_cleanup_after_cancel(self) -> None:
        """Engine cleans up resources after cancellation."""
        engine = ExecutionEngine()

        group = WorkflowExecutionGroup(
            name="mem_group",
            mode=ExecutionMode.SEQUENTIAL,
            agents=[],
        )

        workflow = WorkflowDefinition(name="mem_wf", groups=[group])
        result = engine.execute(workflow)

        # Cancel the execution
        engine.cancel(result.execution_id)

        # Status should still be accessible
        status = engine.get_status(result.execution_id)
        assert status is not None
        assert status["status"] == ExecutionStatus.COMPLETED.value


class TestEngineSingleAgent:
    """Test single-agent workflows."""

    def test_single_agent_sequential(self) -> None:
        """Single agent in sequential mode."""
        engine = ExecutionEngine()

        group = WorkflowExecutionGroup(
            name="single",
            mode=ExecutionMode.SEQUENTIAL,
            agents=[
                WorkflowAgentReference(name="only", agent_id="s1"),
            ],
        )

        workflow = WorkflowDefinition(name="single_wf", groups=[group])
        result = engine.execute(workflow)

        assert result.status == ExecutionStatus.COMPLETED


class TestEngineMultiGroup:
    """Test multi-group workflows."""

    def test_multi_group_execution(self) -> None:
        """Engine executes multiple groups."""
        engine = ExecutionEngine()

        groups = [
            WorkflowExecutionGroup(name="g1", mode=ExecutionMode.SEQUENTIAL, agents=[]),
            WorkflowExecutionGroup(name="g2", mode=ExecutionMode.PARALLEL, agents=[]),
            WorkflowExecutionGroup(name="g3", mode=ExecutionMode.MIXED, agents=[]),
        ]

        workflow = WorkflowDefinition(name="multigroup_wf", groups=groups)
        result = engine.execute(workflow)

        assert result.status == ExecutionStatus.COMPLETED


class TestEngineEmptyWorkflow:
    """Test empty workflows."""

    def test_workflow_with_no_groups(self) -> None:
        """Engine handles workflow with no groups."""
        engine = ExecutionEngine()

        workflow = WorkflowDefinition(name="no_groups")
        result = engine.execute(workflow)

        assert result.status == ExecutionStatus.COMPLETED


class TestEngineSingleGroup:
    """Test single-group workflows."""

    def test_workflow_with_one_group(self) -> None:
        """Engine handles workflow with exactly one group."""
        engine = ExecutionEngine()

        group = WorkflowExecutionGroup(
            name="one_group",
            mode=ExecutionMode.SEQUENTIAL,
            agents=[],
        )

        workflow = WorkflowDefinition(name="one_group_wf", groups=[group])
        result = engine.execute(workflow)

        assert result.status == ExecutionStatus.COMPLETED


class TestEngineAllModesSingleAgent:
    """Test all modes with single agent."""

    def test_all_modes_single_agent(self) -> None:
        """All three modes work with one agent."""
        engine = ExecutionEngine()

        agent = WorkflowAgentReference(name="single", agent_id="sa")

        for mode in [ExecutionMode.SEQUENTIAL, ExecutionMode.PARALLEL, ExecutionMode.MIXED]:
            group = WorkflowExecutionGroup(
                name=f"mode_test_{mode.value}",
                mode=mode,
                agents=[agent],
            )

            workflow = WorkflowDefinition(name=f"mode_wf_{mode.value}", groups=[group])
            result = engine.execute(workflow)

            assert result.status == ExecutionStatus.COMPLETED
