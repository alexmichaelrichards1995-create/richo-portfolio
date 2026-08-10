export const GOVERNANCE_RUNTIME_SPECS = {
  'RSP-004': {
    name: 'AI Use-Case Intake and Approval System',
    family: 'Governance, Risk & Assurance',
    cadence: 'monthly',
    stages: ['draft','intake-complete','risk-routed','evidence-review','human-decision','implementation-handoff','reassessment-due'],
    artefacts: ['use_case_intake','value_hypothesis','dependency_map','affected_person_register','risk_tier','human_oversight','legal_privacy_security_routing','evidence_sufficiency','decision_record','implementation_handoff','reassessment_schedule','portfolio_dashboard'],
    hardGates: ['named_owner','purpose_defined','data_boundary_defined','risk_tier_assigned','required_reviewers_assigned','decision_status_recorded','evidence_links_present','reassessment_date_present'],
    acceptance: 'Every use case has an owner, purpose, data boundary, risk tier, required reviewers, decision status, evidence links and reassessment date.',
    metrics: ['intake_completeness','approval_lead_time','named_owner_coverage','human_oversight_coverage','reassessment_completion','overdue_exceptions']
  },
  'RSP-005': {
    name: 'Human Authority and Escalation Framework',
    family: 'Governance, Risk & Assurance',
    cadence: 'quarterly',
    stages: ['decision-inventory','authority-mapping','threshold-design','delegation-design','scenario-test','human-approval','quarterly-retest'],
    artefacts: ['decision_inventory','authority_boundary_matrix','prohibited_machine_actions','override_protocol','stop_work_protocol','severity_model','approver_roster','delegation_rules','external_action_gate','exception_register','decision_receipt','authority_test'],
    hardGates: ['no_ownerless_consequential_decisions','human_review_point_present','external_actions_human_gated','delegates_defined','escalation_path_defined','stop_work_path_tested'],
    acceptance: 'No consequential decision remains ownerless; automated recommendations have a human review point; external actions remain blocked pending authority.',
    metrics: ['decision_owner_coverage','override_response_time','authority_conflicts','unauthorised_action_events','escalation_test_pass_rate','delegation_coverage']
  },
  'RSP-006': {
    name: 'AI Vendor Due-Diligence Kit',
    family: 'Governance, Risk & Assurance',
    cadence: 'annual-or-material-change',
    stages: ['vendor-profile','criticality','evidence-request','evidence-score','gap-review','exception-routing','human-recommendation'],
    artefacts: ['vendor_profile','ai_system_factsheet','training_data_questionnaire','data_flow_assessment','security_evidence_request','subprocessor_register','model_limitations','human_oversight_assessment','incident_continuity_questionnaire','contract_requirements','scoring_model','recommendation_memo'],
    hardGates: ['criticality_assigned','material_assertions_evidenced_or_unverified','critical_gaps_owned','exceptions_human_approved','limitations_stated'],
    acceptance: 'Every material assertion links to evidence or is marked unverified; critical gaps have owners and treatment decisions; the final recommendation states limitations.',
    metrics: ['evidence_return_rate','critical_gap_count','diligence_cycle_time','approved_exception_count','contract_requirement_closure','reassessment_completion']
  },
  'RSP-007': {
    name: 'AI Incident Response and Learning System',
    family: 'Governance, Risk & Assurance',
    cadence: 'event-driven-plus-quarterly-trend-review',
    stages: ['detected','triaged','contained','evidence-preserved','investigated','remediated','human-return-to-service','lessons-closed'],
    artefacts: ['incident_taxonomy','severity_matrix','triage_form','containment_playbooks','evidence_preservation','notification_matrix','root_cause','affected_person_assessment','remediation_plan','return_to_service_gate','lessons_review','trend_dashboard'],
    hardGates: ['incident_id','severity_assigned','owner_assigned','chronology_recorded','evidence_preserved','containment_decision','remediation_owned','closure_human_approved'],
    acceptance: 'Every incident has an identifier, severity, owner, chronology, evidence set, containment decision, remediation action and closure approval.',
    metrics: ['time_to_triage','time_to_containment','severity_accuracy','evidence_completeness','repeat_incident_rate','remediation_closure']
  },
  'RSP-008': {
    name: 'Model and Prompt Change-Control Kit',
    family: 'Governance, Risk & Assurance',
    cadence: 'per-change',
    stages: ['change-request','impact-assessment','test-plan','benchmark-regression','approval','release-ready','post-release-review'],
    artefacts: ['change_request','asset_version_register','impact_assessment','test_plan','benchmark_regression','red_team_log','privacy_security_gate','approval_matrix','release_checklist','rollback_plan','monitoring_plan','emergency_change_record'],
    hardGates: ['version_recorded','owner_assigned','rationale_recorded','risk_assessed','tests_complete','human_approval','rollback_ready','monitoring_defined'],
    acceptance: 'Every released change has a version, owner, rationale, risk assessment, tests, approval, rollback path and post-release evidence.',
    metrics: ['evidence_complete_changes','regression_escape_rate','rollback_readiness','emergency_change_frequency','approval_lead_time','post_release_review_completion']
  },
  'RSP-009': {
    name: 'Responsible AI Evidence Pack',
    family: 'Governance, Risk & Assurance',
    cadence: 'annual-with-control-specific-frequency',
    stages: ['scope','principle-map','control-map','evidence-map','control-test','remediation','management-review'],
    artefacts: ['principle_control_map','control_register','evidence_catalogue','owner_reviewer_matrix','test_library','exception_remediation_log','control_attestation','governance_pack','risk_acceptance_record','annual_schedule','assurance_statement_template','diligence_index'],
    hardGates: ['principle_has_control','control_has_owner','evidence_requirement_defined','test_method_defined','review_date_present','failed_controls_remediated_or_exceptioned'],
    acceptance: 'Every in-scope principle has at least one control, accountable owner, evidence requirement, test method and review date.',
    metrics: ['controls_with_current_evidence','failed_tests','overdue_remediation','independent_review_coverage','exception_age','evidence_retrieval_time']
  },
  'RSP-010': {
    name: 'Data Governance Readiness Kit',
    family: 'Governance, Risk & Assurance',
    cadence: 'quarterly',
    stages: ['domain-scope','inventory','ownership','classification','quality-design','access-retention','control-test','governance-review'],
    artefacts: ['data_inventory','owner_steward_matrix','purpose_use_register','classification_scheme','quality_rules','lineage_template','access_review','retention_schedule','issue_log','third_party_data_register','governance_forum_pack','control_tests'],
    hardGates: ['critical_dataset_owner','purpose_documented','classification_present','quality_rules_defined','access_path_known','retention_decision_present','issue_process_defined'],
    acceptance: 'Critical datasets have named owners, documented purposes, classifications, quality rules, access paths, retention decisions and issue processes.',
    metrics: ['owner_coverage','critical_quality_pass_rate','access_review_completion','retention_exceptions','issue_closure_time','lineage_coverage']
  },
  'RSP-011': {
    name: 'Privacy-by-Design Operations Kit',
    family: 'Governance, Risk & Assurance',
    cadence: 'per-initiative-and-material-change',
    stages: ['privacy-screen','data-map','necessity-minimisation','risk-routing','design-decision','launch-gate','change-reassessment'],
    artefacts: ['privacy_intake','personal_data_map','purpose_necessity','minimisation','lawful_basis_record','risk_assessment','consent_notice_checklist','request_routing','retention_design','processor_review','launch_gate','change_reassessment'],
    hardGates: ['data_purpose_documented','minimisation_reviewed','retention_defined','processors_recorded','notice_or_consent_path_recorded','risks_routed','human_launch_approval'],
    acceptance: 'No in-scope initiative reaches launch without documented data purpose, minimisation, retention, processors, notices, risks and approval.',
    metrics: ['projects_screened','high_risk_reviews_pre_build','minimisation_actions','privacy_defects_at_launch','request_routing_time','reassessment_compliance']
  },
  'RSP-012': {
    name: 'Cybersecurity Evidence Readiness Kit',
    family: 'Governance, Risk & Assurance',
    cadence: 'quarterly',
    stages: ['scope','system-inventory','control-map','evidence-collection','gap-score','remediation','retrieval-test','refresh'],
    artefacts: ['security_scope','asset_system_register','control_applicability','policy_index','identity_access_pack','vulnerability_record','incident_evidence_map','backup_recovery_evidence','supplier_register','exception_log','remediation_backlog','questionnaire_library'],
    hardGates: ['priority_control_owner','applicability_decision','evidence_state','gap_status','next_review_date','critical_gap_treatment'],
    acceptance: 'All priority controls have an owner, applicability decision, evidence state, gap status and next review.',
    metrics: ['controls_evidenced','critical_gaps','questionnaire_response_time','access_review_completion','vulnerability_remediation','exception_age']
  },
  'RSP-013': {
    name: 'Regulatory Obligations Mapping Kit',
    family: 'Governance, Risk & Assurance',
    cadence: 'quarterly-change-review-plus-annual-attestation',
    stages: ['scope','source-catalogue','obligation-extraction','applicability','process-control-map','ownership','evidence-schedule','change-review'],
    artefacts: ['jurisdiction_register','source_catalogue','obligation_extraction','applicability_decision','obligation_process_map','control_matrix','owner_assignment','evidence_schedule','breach_exception_register','change_impact','management_pack','annual_attestation_plan'],
    hardGates: ['source_recorded','applicability_rationale','process_link','control_assigned','owner_assigned','evidence_requirement','review_date','exception_path'],
    acceptance: 'Each in-scope obligation has a source, applicability rationale, process link, control, owner, evidence requirement, review date and exception path.',
    metrics: ['obligations_mapped','controls_assigned','evidence_current','unresolved_applicability_questions','change_assessments','overdue_exceptions']
  }
};

export const GOVERNANCE_RUNTIME_IDS = Object.freeze(Object.keys(GOVERNANCE_RUNTIME_SPECS));
