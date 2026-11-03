"""Tests for WorkflowDefinition - Phase 4.3"""

import pytest

from app.core.execution.workflow_definition import (
    load_workflow,

    ExecutionMode,
    ConditionOperator,
    WorkflowAgentReference,
    WorkflowExecutionGroup,
    WorkflowRetryPolicy,
    WorkflowTimeoutPolicy,
    WorkflowVariable,
    WorkflowMetadata,
    WorkflowSchema,
    detect_schema_version,
    _parse_simple_yaml,
    WorkflowDefinition,
)


class TestWorkflowDefinitionBasics:
    """Basic WorkflowDefinition tests."""

    def test_execution_mode_sequential(self) -> None:
        """ExecutionMode.SEQUENTIAL has value 'sequential'."""
        assert ExecutionMode.SEQUENTIAL.value == "sequential"

    def test_execution_mode_parallel(self) -> None:
        """ExecutionMode.PARALLEL has value 'parallel'."""
        assert ExecutionMode.PARALLEL.value == "parallel"

    def test_execution_mode_mixed(self) -> None:
        """ExecutionMode.MIXED has value 'mixed'."""
        assert ExecutionMode.MIXED.value == "mixed"

    def test_condition_operator_and(self) -> None:
        """ConditionOperator.AND has value 'and'."""
        assert ConditionOperator.AND.value == "and"

    def test_condition_operator_or(self) -> None:
        """ConditionOperator.OR has value 'or'."""
        assert ConditionOperator.OR.value == "or"

    def test_condition_operator_not(self) -> None:
        """ConditionOperator.NOT has value 'not'."""
        assert ConditionOperator.NOT.value == "not"


class TestWorkflowAgentReference:
    """WorkflowAgentReference tests."""

    def test_agent_reference_creation(self) -> None:
        """Create a WorkflowAgentReference with name and agent_id."""
        ref = WorkflowAgentReference(name="my_agent", agent_id="my_id")
        assert ref.name == "my_agent"
        assert ref.agent_id == "my_id"

    def test_agent_reference_with_params(self) -> None:
        """Create a WorkflowAgentReference with params."""
        ref = WorkflowAgentReference(
            name="my_agent",
            agent_id="my_id",
            params={"param1": "value1"},
        )
        assert ref.name == "my_agent"
        assert ref.agent_id == "my_id"
        assert ref.params == {"param1": "value1"}


class TestWorkflowExecutionGroup:
    """WorkflowExecutionGroup tests."""

    def test_group_creation_basic(self) -> None:
        """Create a basic WorkflowExecutionGroup."""
        group = WorkflowExecutionGroup(name="group1", mode=ExecutionMode.SEQUENTIAL)
        assert group.name == "group1"
        assert group.mode == ExecutionMode.SEQUENTIAL
        assert group.agents == []

    def test_group_with_agents(self) -> None:
        """Create a group with agents."""
        agents = [
            WorkflowAgentReference(name="agent1", agent_id="id1"),
            WorkflowAgentReference(name="agent2", agent_id="id2"),
        ]
        group = WorkflowExecutionGroup(
            name="group1",
            mode=ExecutionMode.PARALLEL,
            agents=agents,
        )
        assert group.name == "group1"
        assert group.mode == ExecutionMode.PARALLEL
        assert len(group.agents) == 2

    def test_group_with_conditions(self) -> None:
        """Create a group with conditions."""
        group = WorkflowExecutionGroup(
            name="group1",
            mode=ExecutionMode.SEQUENTIAL,
            conditions={"step1": ConditionOperator.AND},
        )
        assert group.conditions == {"step1": ConditionOperator.AND}


class TestWorkflowRetryPolicy:
    """WorkflowRetryPolicy tests."""

    def test_retry_policy_default(self) -> None:
        """Default retry policy has max_retries=0."""
        policy = WorkflowRetryPolicy()
        assert policy.max_retries == 0
        assert policy.backoff_base == 1.0
        assert policy.backoff_max == 60.0
        assert policy.retry_on == ["*"]

    def test_retry_policy_custom(self) -> None:
        """Custom retry policy."""
        policy = WorkflowRetryPolicy(
            max_retries=3,
            backoff_base=2.0,
            backoff_max=120.0,
            retry_on=["error", "timeout"],
        )
        assert policy.max_retries == 3
        assert policy.backoff_base == 2.0
        assert policy.backoff_max == 120.0
        assert policy.retry_on == ["error", "timeout"]


class TestWorkflowTimeoutPolicy:
    """WorkflowTimeoutPolicy tests."""

    def test_timeout_policy_default(self) -> None:
        """Default timeout policy is disabled."""
        policy = WorkflowTimeoutPolicy()
        assert policy.enabled == False
        assert policy.minutes == 30

    def test_timeout_policy_enabled(self) -> None:
        """Enabled timeout policy."""
        policy = WorkflowTimeoutPolicy(enabled=True, minutes=60)
        assert policy.enabled == True
        assert policy.minutes == 60


class TestWorkflowVariable:
    """WorkflowVariable tests."""

    def test_variable_creation(self) -> None:
        """Create a WorkflowVariable."""
        var = WorkflowVariable(name="var1", value="value1", description="A test variable")
        assert var.name == "var1"
        assert var.value == "value1"
        assert var.description == "A test variable"
        assert var.readonly == False

    def test_variable_readonly(self) -> None:
        """Create a readonly WorkflowVariable."""
        var = WorkflowVariable(name="var1", value="value1", readonly=True)
        assert var.readonly == True


class TestWorkflowMetadata:
    """WorkflowMetadata tests."""

    def test_metadata_default(self) -> None:
        """Default metadata has no fields."""
        metadata = WorkflowMetadata()
        assert metadata.title is None
        assert metadata.description is None
        assert metadata.version is None
        assert metadata.tags == []

    def test_metadata_full(self) -> None:
        """Full metadata with all fields."""
        metadata = WorkflowMetadata(
            title="My Workflow",
            description="A test workflow",
            version="1.0",
            tags=["tag1", "tag2"],
        )
        assert metadata.title == "My Workflow"
        assert metadata.description == "A test workflow"
        assert metadata.version == "1.0"
        assert metadata.tags == ["tag1", "tag2"]


class TestDetectSchemaVersion:
    """Schema version detection tests."""

    def test_detect_v1_structure(self) -> None:
        """Detect V1 schema from basic structure."""
        data = {"name": "test"}
        version = detect_schema_version(data)
        assert version == "1.0"

    def test_detect_v2_structure(self) -> None:
        """Detect V2 schema from groups structure."""
        data = {"name": "test", "groups": [{"name": "g1", "mode": "sequential"}]}
        version = detect_schema_version(data)
        assert version == "2.0"

    def test_detect_v2_with_schema_version_key(self) -> None:
        """Detect V2 schema from schemaVersion key."""
        data = {"name": "test", "schemaVersion": "2.0"}
        version = detect_schema_version(data)
        assert version == "2.0"


class TestParseSimpleYaml:
    """YAML parsing tests for simple workflow definitions."""

    def test_parse_yaml_basic(self) -> None:
        """Parse basic YAML with name and version."""
        content = "name: test_workflow\nversion: 1.0"
        result = _parse_simple_yaml(content)
        assert result["name"] == "test_workflow"
        # Version should remain string "1.0", not float
        assert isinstance(result["version"], str)
        assert result["version"] == "1.0"

    def test_parse_yaml_with_mode(self) -> None:
        """Parse YAML with mode at level 1."""
        content = "name: test\nmode: sequential"
        result = _parse_simple_yaml(content)
        assert result.get("mode") == ExecutionMode.SEQUENTIAL

    def test_parse_yaml_level2_mode(self) -> None:
        """Parse YAML with mode at level 2 after - name: group1."""
        content = """- name: group1
mode: sequential"""
        result = _parse_simple_yaml(content)
        # Should have groups parsed
        assert "groups" in result or "mode" in result

    def test_parse_yaml_version_string(self) -> None:
        """Ensure version '1.0' stays as string, not float."""
        content = "version: 1.0"
        result = _parse_simple_yaml(content)
        # The version should be string "1.0"
        assert isinstance(result["version"], str)
        # Should NOT be float 1.0
        assert not isinstance(result["version"], float)


class TestLoadWorkflow:
    """Workflow loading tests."""

    def test_load_workflow_from_yaml(self) -> None:
        """Load a workflow from YAML file."""
        import tempfile
        import os

        yaml_content = """
name: test_workflow
version: "1.0"
mode: sequential
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write(yaml_content)
            tmp_path = f.name

        try:
            wf = load_workflow(tmp_path)
            assert wf.name == "test_workflow"
            assert wf.schema_version == "1.0"
        finally:
            os.unlink(tmp_path)

    def test_load_workflow_from_json(self) -> None:
        """Load a workflow from JSON file."""
        import tempfile
        import os
        import json

        json_content = json.dumps({
            "name": "test_workflow",
            "version": "1.0",
            "mode": "sequential",
        })
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            f.write(json_content)
            tmp_path = f.name

        try:
            wf = load_workflow(tmp_path)
            assert wf.name == "test_workflow"
            assert wf.schema_version == "1.0"
        finally:
            os.unlink(tmp_path)


class TestSaveWorkflow:
    """Workflow saving tests."""

    def test_save_workflow_to_yaml(self) -> None:
        """Save a workflow to YAML format."""
        wf = WorkflowDefinition(name="test_workflow")
        import tempfile
        import os

        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            tmp_path = f.name

        try:
            wf.save(tmp_path)
            # Read back and verify
            content = open(tmp_path, "r").read()
            assert "name: test_workflow" in content
        finally:
            os.unlink(tmp_path)

    def test_save_workflow_to_yaml_with_groups(self) -> None:
        """Save a workflow with groups to YAML format."""
        wf = WorkflowDefinition(
            name="test_workflow",
            groups=[
                WorkflowExecutionGroup(name="group1", mode=ExecutionMode.SEQUENTIAL),
            ],
        )
        import tempfile
        import os

        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            tmp_path = f.name

        try:
            wf.save(tmp_path)
            content = open(tmp_path, "r").read()
            assert "name: group1" in content
            assert "mode: sequential" in content
        finally:
            os.unlink(tmp_path)


class TestExampleWorkflows:
    """Example workflow definition tests."""

    def test_example_sequential_workflow(self) -> None:
        """Test sequential workflow example."""
        wf = WorkflowDefinition(
            name="sequential_workflow",
            groups=[
                WorkflowExecutionGroup(
                    name="group1",
                    mode=ExecutionMode.SEQUENTIAL,
                    agents=[
                        WorkflowAgentReference(name="agent1", agent_id="id1"),
                    ],
                ),
            ],
        )
        assert wf.name == "sequential_workflow"
        assert len(wf.groups) == 1
        assert wf.groups[0].mode == ExecutionMode.SEQUENTIAL
        assert len(wf.groups[0].agents) == 1

    def test_example_parallel_workflow(self) -> None:
        """Test parallel workflow example."""
        wf = WorkflowDefinition(
            name="parallel_workflow",
            groups=[
                WorkflowExecutionGroup(
                    name="group1",
                    mode=ExecutionMode.PARALLEL,
                ),
            ],
        )
        assert wf.name == "parallel_workflow"
        assert wf.groups[0].mode == ExecutionMode.PARALLEL


class TestBackwardCompatibility:
    """Backward compatibility tests."""

    def test_backward_compat_v1_groups(self) -> None:
        """WorkflowDefinition works with V1 schema (no groups)."""
        data = {
            "name": "old_workflow",
            "version": "1.0",
            "mode": "sequential",
        }
        wf = WorkflowDefinition.from_dict(data, schema_version="1.0")
        assert wf.name == "old_workflow"
        assert len(wf.groups) == 0

    def test_backward_compat_v1_variables(self) -> None:
        """WorkflowDefinition works with V1 schema variables."""
        data = {
            "name": "old_workflow",
            "version": "1.0",
            "variables": [
                {"name": "var1", "value": "value1"},
            ],
        }
        wf = WorkflowDefinition.from_dict(data, schema_version="1.0")
        assert wf.name == "old_workflow"
        assert len(wf.variables) == 1
        assert wf.variables[0].name == "var1"
        assert wf.variables[0].value == "value1"


class TestWorkflowSerialization:
    """Workflow serialization tests."""

    def test_serialize_to_dict(self) -> None:
        """Serialize WorkflowDefinition to dictionary."""
        wf = WorkflowDefinition(
            name="test",
            groups=[
                WorkflowExecutionGroup(
                    name="group1",
                    mode=ExecutionMode.SEQUENTIAL,
                    agents=[
                        WorkflowAgentReference(name="agent1", agent_id="id1", params={"key": "val"}),
                    ],
                ),
            ],
            variables=[
                WorkflowVariable(name="var1", value="val1", description="desc"),
            ],
            metadata=WorkflowMetadata(
                title="Test",
                version="1.0",
                tags=["tag1"],
            ),
        )

        d = wf.to_dict()
        assert d["name"] == "test"
        assert d["schema_version"] == WorkflowSchema.V1.value
        assert len(d["groups"]) == 1
        assert d["groups"][0]["name"] == "group1"
        assert d["groups"][0]["mode"] == "sequential"
        assert d["groups"][0]["agents"][0]["name"] == "agent1"
        assert d["groups"][0]["agents"][0]["agent_id"] == "id1"
        assert d["groups"][0]["agents"][0]["params"] == {"key": "val"}
        assert len(d["variables"]) == 1
        assert d["variables"][0]["name"] == "var1"
        assert d["variables"][0]["value"] == "val1"
        assert d["variables"][0]["description"] == "desc"
        assert "metadata" in d
        assert d["metadata"]["title"] == "Test"
        assert d["metadata"]["version"] == "1.0"
        assert d["metadata"]["tags"] == ["tag1"]

    def test_serialize_to_yaml(self) -> None:
        """Serialize WorkflowDefinition to YAML string."""
        wf = WorkflowDefinition(
            name="test_workflow",
            groups=[
                WorkflowExecutionGroup(
                    name="group1",
                    mode=ExecutionMode.PARALLEL,
                ),
            ],
        )

        yaml_str = wf.to_yaml()
        assert "name: test_workflow" in yaml_str
        assert "mode: parallel" in yaml_str


class TestExecutionModes:
    """Execution mode behavior tests."""

    def test_group_mode_sequential(self) -> None:
        """Sequential mode group executes one after another."""
        wf = WorkflowDefinition(
            name="seq_workflow",
            groups=[
                WorkflowExecutionGroup(
                    name="group1",
                    mode=ExecutionMode.SEQUENTIAL,
                ),
            ],
        )
        assert wf.groups[0].mode == ExecutionMode.SEQUENTIAL

    def test_group_mode_parallel(self) -> None:
        """Parallel mode group executes concurrently."""
        wf = WorkflowDefinition(
            name="parallel_workflow",
            groups=[
                WorkflowExecutionGroup(
                    name="group1",
                    mode=ExecutionMode.PARALLEL,
                ),
            ],
        )
        assert wf.groups[0].mode == ExecutionMode.PARALLEL

    def test_group_mode_mixed(self) -> None:
        """Mixed mode group combines sequential and parallel."""
        wf = WorkflowDefinition(
            name="mixed_workflow",
            groups=[
                WorkflowExecutionGroup(
                    name="group1",
                    mode=ExecutionMode.MIXED,
                ),
            ],
        )
        assert wf.groups[0].mode == ExecutionMode.MIXED
class TestAdditionalWorkflows:
    """Additional workflow tests."""
    
    def test_workflow_with_variables(self) -> None:
        """Test workflow with variables."""
        wf = WorkflowDefinition(
            name="workflow_with_vars",
            variables=[
                WorkflowVariable(name="var1", value="value1", description="Var 1"),
                WorkflowVariable(name="var2", value=42, readonly=True),
            ],
        )
        assert wf.name == "workflow_with_vars"
        assert len(wf.variables) == 2
        assert wf.variables[0].name == "var1"
        assert wf.variables[0].value == "value1"
        assert wf.variables[0].description == "Var 1"
        assert wf.variables[1].name == "var2"
        assert wf.variables[1].value == 42
        assert wf.variables[1].readonly == True

    def test_workflow_with_empty_groups(self) -> None:
        """Test workflow with no groups."""
        wf = WorkflowDefinition(name="empty_workflow")
        assert wf.name == "empty_workflow"
        assert len(wf.groups) == 0

    def test_workflow_save_and_load(self) -> None:
        """Test workflow save and reload."""
        import tempfile
        import os
        
        wf = WorkflowDefinition(
            name="roundtrip_test",
            groups=[
                WorkflowExecutionGroup(name="group1", mode=ExecutionMode.PARALLEL),
            ],
        )
        
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            tmp_path = f.name
        
        try:
            wf.save(tmp_path)
            loaded = load_workflow(tmp_path)
            assert loaded.name == "roundtrip_test"
            assert len(loaded.groups) == 1
            assert loaded.groups[0].mode == ExecutionMode.PARALLEL
        finally:
            os.unlink(tmp_path)

    def test_workflow_json_load(self) -> None:
        """Test workflow loading from JSON."""
        import json
        import tempfile
        import os
        
        json_content = json.dumps({
            "name": "json_test",
            "version": "2.0",
            "mode": "mixed",
        })
        
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            f.write(json_content)
            tmp_path = f.name
        
        try:
            wf = load_workflow(tmp_path)
            assert wf.name == "json_test"
            assert wf.schema_version == "2.0"
        finally:
            os.unlink(tmp_path)

    def test_workflow_detect_v1_no_groups(self) -> None:
        """Test schema version detection for V1 without groups."""
        data = {"name": "test", "mode": "sequential"}
        version = detect_schema_version(data)
        assert version == "1.0"

    def test_workflow_retry_policy_creation(self) -> None:
        """Test retry policy creation with custom values."""
        policy = WorkflowRetryPolicy(max_retries=5, backoff_base=2.0)
        assert policy.max_retries == 5
        assert policy.backoff_base == 2.0
        assert policy.retry_on == ["*"]

    def test_workflow_timeout_policy_creation(self) -> None:
        """Test timeout policy creation with custom values."""
        policy = WorkflowTimeoutPolicy(enabled=True, minutes=15)
        assert policy.enabled == True
        assert policy.minutes == 15
