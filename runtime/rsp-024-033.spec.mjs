export const DELIVERY_RUNTIME_SPECS = {
  'RSP-024': {
    name: 'Product Requirements and Acceptance Kit', family: 'Product & Delivery', cadence: 'per-product-change',
    stages: ['problem','stakeholders','requirements','priority-risk','acceptance-tests','change-control','evidence','human-acceptance'],
    artefacts: ['problem_statement','stakeholder_needs','functional_requirements','nonfunctional_requirements','assumption_register','dependency_map','acceptance_criteria','traceability_matrix','test_evidence','change_request','acceptance_decision','lessons_review'],
    hardGates: ['requirement_id','source','owner','priority','rationale','acceptance_method','evidence','status'],
    acceptance: 'Every material requirement has identifier, source, owner, priority, rationale, acceptance method, evidence and status.',
    metrics: ['requirements_coverage','first_pass_acceptance','change_frequency','defect_escape','decision_latency','traceability_completeness']
  },
  'RSP-025': {
    name: 'Delivery Scope and Change-Control Kit', family: 'Product & Delivery', cadence: 'per-change-plus-milestone-review',
    stages: ['baseline','deliverable-ownership','thresholds','change-request','impact-assessment','human-approval','rebaseline','variance-review'],
    artefacts: ['scope_baseline','deliverables_catalogue','assumptions_exclusions','dependency_register','work_breakdown','milestone_plan','change_request','impact_assessment','approval_matrix','decision_log','rebaseline_record','closure_acceptance'],
    hardGates: ['change_description','change_reason','cost_time_risk_impact','owner','approval_state','updated_baseline'],
    acceptance: 'No change enters delivery without description, reason, impact, owner, approval state and updated baseline.',
    metrics: ['scope_variance','change_approval_time','unfunded_work','milestone_slippage','dependency_failure','acceptance_delay']
  },
  'RSP-026': {
    name: 'Implementation Readiness Kit', family: 'Product & Delivery', cadence: 'pre-start-plus-early-life-review',
    stages: ['charter','readiness-assessment','blocker-classification','remediation','dependency-test','human-go-no-go','early-life-monitoring'],
    artefacts: ['implementation_charter','readiness_domain_model','stakeholder_raci','data_assessment','integration_assessment','security_privacy_checklist','process_readiness','training_plan','cutover_prerequisites','risk_register','go_no_go_pack','first_30_days_plan'],
    hardGates: ['critical_prerequisite_owner','evidence','due_date','risk_state','decision'],
    acceptance: 'All critical prerequisites have an owner, evidence, due date, risk state and decision before mobilisation.',
    metrics: ['readiness_score','critical_blockers','go_live_delay','dependency_closure','training_completion','early_life_incidents']
  },
  'RSP-027': {
    name: 'Service Operations and SLA Evidence Kit', family: 'Product & Delivery', cadence: 'monthly-service-review-plus-quarterly-test',
    stages: ['service-inventory','commitment-map','measurement-definition','data-source-validation','operation','breach-review','exception-management','improvement'],
    artefacts: ['service_catalogue','sla_register','measurement_definitions','data_source_map','service_dashboard','incident_linkage','breach_assessment','exception_record','review_agenda','improvement_plan','customer_evidence_pack','quarterly_control_test'],
    hardGates: ['commitment_definition','source','formula','owner','threshold','evidence','escalation_route'],
    acceptance: 'Every material service commitment has definition, source, formula, owner, threshold, evidence and escalation route.',
    metrics: ['sla_attainment','measurement_coverage','breach_recurrence','incident_resolution','review_completion','improvement_closure']
  },
  'RSP-028': {
    name: 'Quality Assurance and Release Readiness Kit', family: 'Product & Delivery', cadence: 'per-release',
    stages: ['release-scope','risk-classification','test-obligations','test-execution','defect-triage','rollback-verification','human-release-approval','post-release-monitoring'],
    artefacts: ['release_scope','risk_classification','test_strategy','test_case_register','traceability_matrix','defect_triage','security_privacy_accessibility_gates','performance_evidence','rollback_plan','release_approval','post_release_monitoring','retrospective'],
    hardGates: ['no_unresolved_critical_defects','mandatory_evidence_present','rollback_ready','human_release_approval'],
    acceptance: 'No release proceeds with unresolved critical defects, missing mandatory evidence, absent rollback or unauthorised approval.',
    metrics: ['test_coverage','critical_defect_escape','rollback_rate','approval_completeness','regression_pass_rate','post_release_incidents']
  },
  'RSP-029': {
    name: 'Technical Debt and Refactoring Governance Kit', family: 'Product & Delivery', cadence: 'monthly-portfolio-review',
    stages: ['identify','classify-score','business-impact','option-estimate','prioritise','human-capacity-approval','remediate','benefit-review'],
    artefacts: ['debt_register','taxonomy','business_impact_model','risk_score','dependency_map','remediation_options','cost_capacity_estimate','prioritisation_model','approval_record','delivery_evidence','benefit_review','dashboard'],
    hardGates: ['evidence','owner','impact','risk','dependencies','option','estimate','decision','review_date'],
    acceptance: 'Each priority debt item has evidence, owner, impact, risk, dependencies, option, estimate, decision and review date.',
    metrics: ['critical_debt_exposure','remediation_throughput','incident_linkage','capacity_allocation','high_risk_debt_age','benefits_realised']
  },
  'RSP-030': {
    name: 'Integration and API Readiness Kit', family: 'Product & Delivery', cadence: 'per-interface-and-cutover',
    stages: ['scope','interface-inventory','contract-design','ownership','failure-design','normal-path-test','failure-path-test','human-cutover-approval'],
    artefacts: ['integration_scope','context_diagram','interface_inventory','data_contract','identity_access_design','error_retry_model','rate_capacity_assumptions','security_privacy_checklist','test_plan','operational_ownership','cutover_checklist','acceptance_record'],
    hardGates: ['documented_contract','owner','security_boundary','error_behaviour','capacity_assumption','test_evidence','support_path'],
    acceptance: 'Each interface has documented contract, owner, security boundary, error behaviour, capacity assumption, test evidence and support path.',
    metrics: ['interface_coverage','test_pass_rate','integration_defects','error_recovery_success','ownership_coverage','cutover_incidents']
  },
  'RSP-031': {
    name: 'Accessibility Readiness Kit', family: 'Product & Delivery', cadence: 'per-release-and-material-change',
    stages: ['scope-users','requirements','design-review','content-review','testing','defect-management','exception-approval','release-gate','roadmap'],
    artefacts: ['accessibility_scope','user_needs','requirements_checklist','design_review','content_checklist','test_plan','assistive_technology_evidence','defect_model','exception_process','release_gate','conformance_evidence_index','improvement_roadmap'],
    hardGates: ['requirements_present','test_evidence','defect_status','named_release_decision'],
    acceptance: 'All in-scope features have accessibility requirements, test evidence, defect status and named release decision.',
    metrics: ['requirement_coverage','critical_defects','remediation_time','testing_completion','exception_age','gate_pass_rate']
  },
  'RSP-032': {
    name: 'Business Continuity and Recovery Kit', family: 'Product & Delivery', cadence: 'annual-plus-material-change-and-exercise',
    stages: ['critical-service-inventory','impact-assessment','recovery-objectives','dependency-map','strategy','playbooks','exercise','remediation','annual-review'],
    artefacts: ['critical_service_inventory','business_impact_assessment','recovery_objectives','dependency_map','continuity_strategies','response_roles','communication_matrix','recovery_playbooks','test_scenarios','exercise_record','remediation_plan','annual_assurance_pack'],
    hardGates: ['service_owner','impact_profile','recovery_objective','dependency_map','response_plan','test_result','gap_treatment'],
    acceptance: 'Each critical service has owner, impact profile, recovery objective, dependency map, response plan, test result and gap treatment.',
    metrics: ['services_assessed','rto_rpo_achievement','dependency_coverage','exercise_completion','gap_closure','plan_currency']
  },
  'RSP-033': {
    name: 'Supplier and Subcontractor Assurance Kit', family: 'Product & Delivery', cadence: 'onboarding-plus-periodic-review',
    stages: ['supplier-inventory','criticality','diligence','obligation-map','performance-monitoring','incident-review','remediation','exit-readiness'],
    artefacts: ['supplier_inventory','criticality_model','diligence_checklist','obligation_register','performance_scorecard','incident_log','subcontractor_disclosure','continuity_evidence','exception_register','review_agenda','remediation_plan','exit_checklist'],
    hardGates: ['owner','risk_tier','current_diligence','obligations','performance_evidence','continuity_state','exit_plan'],
    acceptance: 'Every critical supplier has owner, risk tier, current diligence, obligations, performance evidence, continuity state and exit plan.',
    metrics: ['critical_suppliers_assessed','obligation_coverage','sla_performance','open_critical_issues','review_completion','exit_readiness']
  }
};

export const DELIVERY_RUNTIME_IDS = Object.freeze(Object.keys(DELIVERY_RUNTIME_SPECS));
