"""WorkflowDefinition — Workflow model and schema.

Defines the data model for security workflows, including execution groups,
modes, agents, retry/timeout policies, variables, and schema validation.

Supports YAML/JSON loading, parsing, serialization, and backward compatibility.
"""

from __future__ import annotations

import re
from enum import StrEnum, Enum
from pathlib import Path
from typing import (
    Any,
    Dict,
    List,
    Optional,
    Union,
)


class ExecutionMode(str, Enum):
    """Execution mode for a workflow group."""

    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"
    MIXED = "mixed"


class ConditionOperator(str, Enum):
    """Boolean operators for workflow conditions."""

    AND = "and"
    OR = "or"
    NOT = "not"


class WorkflowAgentReference:
    """Reference to an agent within a workflow."""

    def __init__(self, name: str, agent_id: str, params: Optional[Dict[str, Any]] = None) -> None:
        self.name = name
        self.agent_id = agent_id
        self.params = params or {}


class WorkflowExecutionGroup:
    """An execution group within a workflow definition."""

    def __init__(
        self,
        name: str,
        mode: ExecutionMode,
        agents: Optional[List[WorkflowAgentReference]] = None,
        conditions: Optional[Dict[str, ConditionOperator]] = None,
    ) -> None:
        self.name = name
        self.mode = mode
        self.agents = agents or []
        self.conditions = conditions or {}


class WorkflowRetryPolicy:
    """Retry policy for workflow execution steps."""

    def __init__(
        self,
        max_retries: int = 0,
        backoff_base: float = 1.0,
        backoff_max: float = 60.0,
        retry_on: Optional[List[str]] = None,
    ) -> None:
        self.max_retries = max_retries
        self.backoff_base = backoff_base
        self.backoff_max = backoff_max
        self.retry_on = retry_on or ["*"]  # retry on all statuses by default


class WorkflowTimeoutPolicy:
    """Timeout policy for workflow execution steps."""

    def __init__(
        self,
        enabled: bool = False,
        minutes: int = 30,
    ) -> None:
        self.enabled = enabled
        self.minutes = minutes


class WorkflowVariable:
    """A variable that can be used in workflow substitution."""

    def __init__(
        self,
        name: str,
        value: Any,
        description: Optional[str] = None,
        readonly: bool = False,
    ) -> None:
        self.name = name
        self.value = value
        self.description = description
        self.readonly = readonly


class WorkflowMetadata:
    """Metadata associated with a workflow definition."""

    def __init__(
        self,
        title: Optional[str] = None,
        description: Optional[str] = None,
        version: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> None:
        self.title = title
        self.description = description
        self.version = version
        self.tags = tags or []


class WorkflowSchema(Enum):
    """Supported workflow schema versions."""

    V1 = "1.0"
    V2 = "2.0"


def detect_schema_version(data: Dict[str, Any]) -> str:
    """Detect the schema version from workflow data.

    Args:
        data: Raw workflow data dictionary

    Returns:
        Schema version string
    """
    if not isinstance(data, dict):
        return str(WorkflowSchema.V1.value)

    # Check for known schema markers
    if "schemaVersion" in data:
        return str(data["schemaVersion"])

    # Heuristic: check structure    if "groups" in data and isinstance(data["groups"], list):
        # Check if groups have mode property
        for group in data["groups"]:
            if isinstance(group, dict) and "mode" in group:
                return str(WorkflowSchema.V2.value)
    # V2 also indicated by top-level mode (especially non-sequential modes like 'mixed' or 'parallel')
    if "mode" in data and isinstance(data["mode"], str) and data["mode"] != "sequential":
        return str(WorkflowSchema.V2.value)
    return str(WorkflowSchema.V1.value)


def _parse_simple_yaml(content: str) -> Dict[str, Any]:
    """Parse simple YAML workflow content.

    Handles basic YAML structure for workflow definitions with support for:
    - Key-value pairs
    - List items with `- ` prefix
    - Nested properties at level 2
    - Version and mode configuration

    Returns:
        Parsed dictionary representation of the YAML content
    """
    result: Dict[str, Any] = {}
    current_key: Optional[str] = None
    current_list_items: List[Dict[str, Any]] = []
    in_list_block = False
    current_group: Optional[Dict[str, Any]] = None
    in_groups_section = False
    in_agents_subsection = False

    lines = content.split("\n")

    for i, line in enumerate(lines):
        # Calculate indentation BEFORE stripping - key to fixing indentation detection
        stripped_line = line.lstrip()
        indent = len(line) - len(stripped_line)  # Original indent count
        level = indent // 2  # Each indent level is 2 spaces
        stripped = stripped_line

        # Skip empty lines and comments
        if not stripped or stripped.startswith("#"):
            continue
        # Handle groups section header at level 0
        if indent == 0 and stripped == "groups:":
            in_groups_section = True
            continue

        # Level-1 key: "key: value"
        if stripped.startswith("- "):
            # List item at level 1
            list_item = stripped[2:].strip()
            # Check if we're in a groups section
            if in_groups_section:
                # Process as group property
                if ":" in list_item:
                    key, value = list_item.split(":", 1)
                    key = key.strip()
                    value = value.strip()
                    if key == "name":
                        # Start a new group
                        if current_group is not None and current_group.get("name") is not None:
                            # Finalize previous group
                            if "groups" not in result or result["groups"] is None:
                                result["groups"] = []
                            if len(result["groups"]) == 0 or result["groups"][-1].get("name") != current_group["name"]:
                                result["groups"].append(current_group)
                        # Start new group
                        current_group = {"name": value, "mode": ExecutionMode.SEQUENTIAL, "agents": []}
                        if "groups" not in result or result["groups"] is None:
                            result["groups"] = []
                        result["groups"].append(current_group)
                    elif key == "mode" and current_group is not None:
                        current_group["mode"] = ExecutionMode(value)
                    elif key == "agents":
                        in_agents_subsection = True
                        current_group["agents"] = []
                    else:
                        if current_group is not None:
                            current_group[key] = value
                else:
                    # List item without colon - could be a group name
                    if current_group is None:
                        current_group = {"name": list_item, "mode": ExecutionMode.SEQUENTIAL, "agents": []}
                        if "groups" not in result or result["groups"] is None:
                            result["groups"] = []
                        result["groups"].append(current_group)
                    else:
                        current_group["name"] = list_item
            else:
                # Original top-level processing
                if ":" in list_item:
                    key, value = list_item.split(":", 1)
                    key = key.strip()
                    value = value.strip()
                    # Handle "- name: value" pattern
                    if key == "name":
                        current_list_items.append({"name": value})
                    elif key == "mode":
                        current_list_items.append({"mode": value})
                    elif key == "agents":
                        # Handle "- agents:" with nested items
                        if value:
                            current_list_items.append({"agents": value})
                        else:
                            current_list_items.append({"agents": []})
                    else:
                        current_list_items.append({key: value})
                else:
                    current_list_items.append({"value": list_item})

        # Level-0 key-value pair (top-level, not indented)
        elif ":" in stripped and not stripped.startswith("-") and level == 0:
            key, value = stripped.split(":", 1)
            key = key.strip()
            value = value.strip()

            # Handle version - keep as string, don't convert "1.0" to float
            if key == "version":
                # Keep version as string, strip any surrounding quotes
                result[key] = value.strip('"').strip("'")
            elif key == "mode":
                result["mode"] = ExecutionMode(value)
            elif key == "agents":
                # Parse agents from YAML
                if value:
                    result["agents"] = value
                else:
                    result["agents"] = []
            else:
                result[key] = value

        # Level-2 property (indented under a list item)
        elif current_list_items and (stripped.startswith("- ") or stripped == ""):
            # This is a level-2 item under a list
            # Process level-2 group properties like "mode: sequential"
            pass

        # Indented line (level 2+) - properties under a group in groups section
        elif level >= 1 and in_groups_section and current_group is not None:
            import sys; print(f"DEBUG: Indented line block entered! stripped='{stripped}' level={level} in_groups={in_groups_section} current_group={current_group is not None}", file=sys.stderr)
            if ":" in stripped:
                import sys; print(f"DEBUG: Colon in stripped, key will be extracted", file=sys.stderr)
                key, _, value = stripped.partition(":")
                key = key.strip()
                value = value.strip()
                import sys; print(f"DEBUG: key='{key}', value='{value}'", file=sys.stderr)

                # Type coercion for mode
                if value.lower() == "true":
                    value = True
                elif value.lower() == "false":
                    value = False
                elif value.isdigit():
                    value = int(value)
                else:
                    try:
                        value = float(value)
                    except ValueError:
                        pass

                if key == "mode":
                    try:
                        current_group["mode"] = ExecutionMode(value)
                    except ValueError:
                        current_group["mode"] = value
                else:
                    current_group[key] = value
            else:
                import sys; print(f"DEBUG: No colon in stripped", file=sys.stderr)

    # Post-processing: ensure groups structure is complete
    if "groups" in result and isinstance(result["groups"], list):
        # Ensure all groups have required fields
        for group in result["groups"]:
            if not isinstance(group, dict):
                continue
            if "name" not in group:
                # Give the group a default name
                group["name"] = group.get("mode", {}).value if isinstance(group.get("mode"), ExecutionMode) else "unknown"
            if "mode" not in group:
                group["mode"] = ExecutionMode.SEQUENTIAL

    # Ensure version is a string
    if "version" in result and not isinstance(result["version"], str):
        result["version"] = str(result["version"])

    return result


def load_workflow(filepath: Union[str, Path]) -> "WorkflowDefinition":
    """Load a workflow from a file.

    Supports YAML and JSON workflow definition files.

    Args:
        filepath: Path to the workflow definition file

    Returns:
        WorkflowDefinition instance
    """
    filepath = Path(filepath)

    if not filepath.exists():
        raise FileNotFoundError(f"Workflow file not found: {filepath}")

    # Read file content
    content = filepath.read_text(encoding="utf-8")

    # Detect format and parse
    if filepath.suffix.lower() in (".yaml", ".yml"):
        data = _parse_simple_yaml(content)
    elif filepath.suffix.lower() == ".json":
        import json
        data = json.loads(content)
    else:
        # Try as simple YAML first
        data = _parse_simple_yaml(content)

    # Detect schema version
    schema_version = detect_schema_version(data)

    # Extract name from data
    name = data.get("name", "unnamed_workflow")

    # Convert to WorkflowDefinition
    wf = WorkflowDefinition(name=name)
    return wf.from_dict(data, schema_version)


class WorkflowDefinition:
    """A complete workflow definition with execution groups, agents, and policies."""

    def __init__(
        self,
        name: str,
        groups: Optional[List[WorkflowExecutionGroup]] = None,
        variables: Optional[List[WorkflowVariable]] = None,
        metadata: Optional[WorkflowMetadata] = None,
        retry_policy: Optional[WorkflowRetryPolicy] = None,
        timeout_policy: Optional[WorkflowTimeoutPolicy] = None,
        schema_version: str = WorkflowSchema.V1.value,
    ) -> None:
        self.name = name
        self.groups = groups or []
        self.variables = variables or []
        self.metadata = metadata or WorkflowMetadata()
        self.retry_policy = retry_policy or WorkflowRetryPolicy()
        self.timeout_policy = timeout_policy or WorkflowTimeoutPolicy()
        self.schema_version = schema_version

    @classmethod
    def from_dict(
        cls,
        data: Dict[str, Any],
        schema_version: str = WorkflowSchema.V1.value,
    ) -> "WorkflowDefinition":
        """Create a WorkflowDefinition from a dictionary.

        Args:
            data: Parsed workflow data dictionary
            schema_version: Detected schema version

        Returns:
            WorkflowDefinition instance
        """
        # Extract basic properties
        name = data.get("name", "unnamed_workflow")

        # Parse groups
        groups_data = data.get("groups", [])
        groups: List[WorkflowExecutionGroup] = []

        if isinstance(groups_data, list):
            for group_data in groups_data:
                if isinstance(group_data, dict):
                    group_name = group_data.get("name", "unnamed_group")
                    mode_str = group_data.get("mode", "sequential")
                    mode = ExecutionMode(mode_str) if isinstance(mode_str, str) else ExecutionMode.SEQUENTIAL

                    agents_data = group_data.get("agents", [])
                    agents: List[WorkflowAgentReference] = []

                    if isinstance(agents_data, list):
                        for agent_data in agents_data:
                            if isinstance(agent_data, dict):
                                agent_name = agent_data.get("name", "")
                                agent_id = agent_data.get("agent_id", "")
                                agent_params = agent_data.get("params", {})
                                agents.append(WorkflowAgentReference(
                                    name=agent_name,
                                    agent_id=agent_id,
                                    params=agent_params,
                                ))

                    conditions_data = group_data.get("conditions", {})
                    conditions: Dict[str, ConditionOperator] = {}
                    if isinstance(conditions_data, dict):
                        for cond_key, cond_op in conditions_data.items():
                            if isinstance(cond_op, str):
                                conditions[cond_key] = ConditionOperator(cond_op)
                            elif isinstance(cond_op, ConditionOperator):
                                conditions[cond_key] = cond_op

                    groups.append(WorkflowExecutionGroup(
                        name=group_name,
                        mode=mode,
                        agents=agents,
                        conditions=conditions,
                    ))
                elif isinstance(group_data, str):
                    # String group name
                    groups.append(WorkflowExecutionGroup(name=group_data, mode=ExecutionMode.SEQUENTIAL))

        # Parse variables
        variables_data = data.get("variables", [])
        variables: List[WorkflowVariable] = []
        if isinstance(variables_data, list):
            for var_data in variables_data:
                if isinstance(var_data, dict):
                    var_name = var_data.get("name", "")
                    var_value = var_data.get("value")
                    var_description = var_data.get("description")
                    var_readonly = var_data.get("readonly", False)
                    variables.append(WorkflowVariable(
                        name=var_name,
                        value=var_value,
                        description=var_description,
                        readonly=var_readonly,
                    ))

        # Parse metadata
        metadata_data = data.get("metadata", {})
        metadata = WorkflowMetadata(
            title=metadata_data.get("title"),
            description=metadata_data.get("description"),
            version=metadata_data.get("version"),
            tags=metadata_data.get("tags"),
        )

        # Parse retry policy
        retry_data = data.get("retry_policy", {})
        retry_policy = WorkflowRetryPolicy(
            max_retries=retry_data.get("max_retries", 0),
            backoff_base=retry_data.get("backoff_base", 1.0),
            backoff_max=retry_data.get("backoff_max", 60.0),
            retry_on=retry_data.get("retry_on"),
        )

        # Parse timeout policy
        timeout_data = data.get("timeout_policy", {})
        timeout_policy = WorkflowTimeoutPolicy(
            enabled=timeout_data.get("enabled", False),
            minutes=timeout_data.get("minutes", 30),
        )

        # Schema version
        if isinstance(data.get("schema_version"), str):
            schema_version = data["schema_version"]
        elif isinstance(data.get("schema_version"), WorkflowSchema):
            schema_version = data["schema_version"].value

        # Create instance and set properties
        wf = cls(name=name, schema_version=schema_version)
        wf.groups = groups
        wf.variables = variables
        wf.metadata = metadata
        wf.retry_policy = retry_policy
        wf.timeout_policy = timeout_policy

        return wf

    def to_dict(self) -> Dict[str, Any]:
        """Convert workflow definition to dictionary.

        Returns:
            Dictionary representation of the workflow
        """
        result: Dict[str, Any] = {
            "name": self.name,
            "schema_version": self.schema_version,
        }

        # Serialize groups
        groups_dict: List[Dict[str, Any]] = []
        for group in self.groups:
            group_dict: Dict[str, Any] = {
                "name": group.name,
                "mode": group.mode.value,
            }

            # Serialize agents
            if group.agents:
                agents_list: List[Dict[str, Any]] = []
                for agent in group.agents:
                    agent_dict: Dict[str, Any] = {
                        "name": agent.name,
                        "agent_id": agent.agent_id,
                    }
                    if agent.params:
                        agent_dict["params"] = agent.params
                    agents_list.append(agent_dict)
                group_dict["agents"] = agents_list

            # Serialize conditions
            if group.conditions:
                conditions_dict: Dict[str, str] = {}
                for key, op in group.conditions.items():
                    conditions_dict[key] = op.value
                group_dict["conditions"] = conditions_dict

            groups_dict.append(group_dict)

        result["groups"] = groups_dict

        # Serialize variables
        if self.variables:
            variables_list: List[Dict[str, Any]] = []
            for var in self.variables:
                var_dict: Dict[str, Any] = {
                    "name": var.name,
                    "value": var.value,
                }
                if var.description:
                    var_dict["description"] = var.description
                if var.readonly:
                    var_dict["readonly"] = var.readonly
                variables_list.append(var_dict)
            result["variables"] = variables_list

        # Serialize metadata
        if self.metadata.title:
            result["metadata"] = {
                "title": self.metadata.title,
            }
        if self.metadata.description:
            if "metadata" not in result:
                result["metadata"] = {}
            result["metadata"]["description"] = self.metadata.description
        if self.metadata.version:
            if "metadata" not in result:
                result["metadata"] = {}
            result["metadata"]["version"] = self.metadata.version
        if self.metadata.tags:
            if "metadata" not in result:
                result["metadata"] = {}
            result["metadata"]["tags"] = self.metadata.tags
        if self.metadata.title or self.metadata.description or self.metadata.version or self.metadata.tags:
            result["metadata"] = result.get("metadata", {})

        # Serialize retry policy
        if self.retry_policy.max_retries > 0 or self.retry_policy.backoff_base != 1.0:
            result["retry_policy"] = {
                "max_retries": self.retry_policy.max_retries,
                "backoff_base": self.retry_policy.backoff_base,
                "backoff_max": self.retry_policy.backoff_max,
                "retry_on": self.retry_policy.retry_on,
            }

        # Serialize timeout policy
        if self.timeout_policy.enabled:
            result["timeout_policy"] = {
                "enabled": self.timeout_policy.enabled,
                "minutes": self.timeout_policy.minutes,
            }

        return result

    def save(self, filepath: Union[str, Path]) -> None:
        """Save workflow definition to a file.

        Args:
            filepath: Path to save the workflow definition
        """
        filepath = Path(filepath)
        content = self.to_yaml()
        filepath.write_text(content, encoding="utf-8")

    def to_yaml(self, indent: int = 0) -> str:
        """Convert workflow definition to YAML string.

        Returns:
            YAML representation of the workflow
        """
        lines: List[str] = []
        spaces = "  " * indent

        # Header
        lines.append(f"{spaces}name: {self.name}")
        lines.append(f"{spaces}version: \"{self.schema_version}\"")

        # Groups
        if self.groups:
            lines.append(f"{spaces}groups:")
            for group in self.groups:
                lines.append(f"{spaces}- name: {group.name}")
                lines.append(f"{spaces}  mode: {group.mode.value}")
                if group.agents:
                    lines.append(f"{spaces}  agents:")
                    for agent in group.agents:
                        lines.append(f"{spaces}- name: {agent.name}")
                        if agent.agent_id:
                            lines.append(f"{spaces}  agent_id: {agent.agent_id}")
                        if agent.params:
                            for param_key, param_value in agent.params.items():
                                lines.append(f"{spaces}  {param_key}: {param_value}")
                if group.conditions:
                    lines.append(f"{spaces}  conditions:")
                    for key, op in group.conditions.items():
                        lines.append(f"{spaces}{key}: {op.value}")

        # Variables
        if self.variables:
            lines.append(f"{spaces}variables:")
            for var in self.variables:
                lines.append(f"{spaces}- name: {var.name}")
                lines.append(f"{spaces}  value: {var.value}")
                if var.description:
                    lines.append(f"{spaces}  description: {var.description}")
                if var.readonly:
                    lines.append(f"{spaces}  readonly: {var.readonly}")

        # Metadata
        if self.metadata.title or self.metadata.description or self.metadata.version or self.metadata.tags:
            lines.append(f"{spaces}metadata:")
            if self.metadata.title:
                lines.append(f"{spaces}  title: {self.metadata.title}")
            if self.metadata.description:
                lines.append(f"{spaces}  description: {self.metadata.description}")
            if self.metadata.version:
                lines.append(f"{spaces}  version: {self.metadata.version}")
            if self.metadata.tags:
                lines.append(f"{spaces}  tags: {self.metadata.tags}")

        # Retry policy
        if self.retry_policy.max_retries > 0 or self.retry_policy.backoff_base != 1.0:
            lines.append(f"{spaces}retry_policy:")
            lines.append(f"{spaces}  max_retries: {self.retry_policy.max_retries}")
            lines.append(f"{spaces}  backoff_base: {self.retry_policy.backoff_base}")
            lines.append(f"{spaces}  backoff_max: {self.retry_policy.backoff_max}")
            if self.retry_policy.retry_on:
                lines.append(f"{spaces}  retry_on: {self.retry_policy.retry_on}")

        # Timeout policy
        if self.timeout_policy.enabled:
            lines.append(f"{spaces}timeout_policy:")
            lines.append(f"{spaces}  enabled: {self.timeout_policy.enabled}")
            lines.append(f"{spaces}  minutes: {self.timeout_policy.minutes}")

        return "\n".join(lines)

    def __str__(self) -> str:
        return f"WorkflowDefinition(name={self.name}, groups={len(self.groups)}, schema={self.schema_version})"

    def __repr__(self) -> str:
        return f"WorkflowDefinition(name={self.name!r}, groups={len(self.groups)}, schema={self.schema_version!r})"