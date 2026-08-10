export const LEADERSHIP_RUNTIME_SPECS = {
  'RSP-044': {
    name: 'Executive Decision Rights System', family: 'Leadership, Workforce & Operating System', cadence: 'quarterly',
    stages: ['decision-inventory','taxonomy','owner-assignment','threshold-design','delegation','conflict-test','human-approval','quarterly-review'],
    artefacts: ['decision_inventory','decision_taxonomy','authority_matrix','threshold_schedule','input_checklist','consultation_map','delegation_rules','escalation_path','decision_record','exception_register','latency_dashboard','quarterly_review'],
    hardGates: ['accountable_owner','delegates_defined','consultation_requirements','evidence_threshold','escalation_path','record_standard'],
    acceptance: 'Every material decision class has one accountable owner, defined delegates, consultation requirements, evidence threshold, escalation path and record standard.',
    metrics: ['decision_cycle_time','unowned_decisions','escalations','rework_from_ambiguity','delegation_coverage','record_completeness']
  },
  'RSP-045': {
    name: 'Board and Governance Reporting Kit', family: 'Leadership, Workforce & Operating System', cadence: 'board-calendar-driven',
    stages: ['calendar','decision-map','metric-rationalisation','paper-standard','author-review','action-tracking','effectiveness-review'],
    artefacts: ['board_calendar','agenda_architecture','decision_forward_cover','kpi_definitions','risk_summary','financial_question_schedule','commercial_section','people_capability_section','assurance_section','decision_request_template','action_tracker','minutes_evidence_checklist'],
    hardGates: ['purpose','decision_requested','evidence','risks','recommendation','owner','follow_up_action'],
    acceptance: 'Every paper states purpose, decision requested, evidence, risks, recommendation, owner and follow-up action.',
    metrics: ['papers_on_time','decisions_resolved','action_closure','metric_definition_coverage','repeat_information_requests','pack_length']
  },
  'RSP-046': {
    name: 'Enterprise Risk and Controls Register Kit', family: 'Leadership, Workforce & Operating System', cadence: 'quarterly-plus-annual-schedule',
    stages: ['objectives-taxonomy','risk-identification','scoring','control-map','owner-assignment','control-test','treatment','human-acceptance-review'],
    artefacts: ['risk_taxonomy','risk_register','inherent_residual_scoring','control_register','owner_matrix','test_procedure','evidence_index','treatment_plan','acceptance_exception_record','key_risk_indicators','management_report','annual_schedule'],
    hardGates: ['risk_owner','causes','consequences','controls','evidence','residual_rating','treatment','acceptance_authority','review_date'],
    acceptance: 'Every high risk has owner, causes, consequences, controls, evidence, residual rating, treatment, acceptance authority and review date.',
    metrics: ['high_risks_without_treatment','controls_tested','failed_controls','overdue_actions','acceptance_age','kri_breaches']
  },
  'RSP-047': {
    name: 'Policy Lifecycle Management Kit', family: 'Leadership, Workforce & Operating System', cadence: 'policy-review-calendar',
    stages: ['inventory','dedupe-gap','ownership','standardise','approval-publication','attestation','review','retire'],
    artefacts: ['policy_inventory','hierarchy','mandatory_content_standard','owner_approver_matrix','consultation_record','approval_workflow','publication_register','training_attestation_log','exception_register','review_calendar','change_history','archive_checklist'],
    hardGates: ['owner','approver','version','effective_date','audience','related_procedure','exception_process','next_review'],
    acceptance: 'Every active policy has owner, approver, version, effective date, audience, related procedure, exception process and next review.',
    metrics: ['policies_current','overdue_reviews','attestation_completion','exceptions','duplicates','change_communication_completion']
  },
  'RSP-048': {
    name: 'Evidence-Based Strategy Execution Kit', family: 'Leadership, Workforce & Operating System', cadence: 'monthly-review-plus-quarterly-reset',
    stages: ['strategy-thesis','outcome-map','assumption-register','initiative-portfolio','owner-map','evidence-rules','monthly-review','quarterly-reset'],
    artefacts: ['strategy_thesis','objective_outcome_map','assumption_register','initiative_portfolio','owner_decision_rights','metric_dictionary','benefit_hypothesis','dependency_log','monthly_review_pack','stop_continue_scale_criteria','decision_record','quarterly_reset'],
    hardGates: ['outcome','owner','metric','baseline','target','assumptions','initiatives','risk','adaptation_rule'],
    acceptance: 'Every priority has outcome, owner, metric, baseline, target, assumptions, initiatives, risk and explicit adaptation rule.',
    metrics: ['objective_progress','assumptions_validated','initiatives_stopped_early','benefit_realisation','decision_latency','dependency_closure']
  },
  'RSP-049': {
    name: 'Operating Model and RACI Builder', family: 'Leadership, Workforce & Operating System', cadence: '90-day-pilot-review',
    stages: ['objectives','capability-map','process-ownership','role-interfaces','forum-rationalisation','service-expectations','pilot','90_day_review'],
    artefacts: ['operating_model_principles','capability_map','process_ownership_map','raci_library','decision_rights_matrix','team_interface_contracts','service_expectations','forum_architecture','information_flow_map','capacity_assumptions','escalation_model','plan_90_days'],
    hardGates: ['process_owner','contributors','decision_rights','inputs','outputs','interfaces','service_expectations','escalation'],
    acceptance: 'All critical processes have owner, contributors, decision rights, inputs, outputs, interfaces, service expectations and escalation.',
    metrics: ['unowned_processes','role_conflicts','handoff_failures','decision_latency','forum_effectiveness','implementation_completion']
  },
  'RSP-050': {
    name: 'Workforce AI Adoption and Change Kit', family: 'Leadership, Workforce & Operating System', cadence: 'per-rollout-plus-post-adoption-review',
    stages: ['approved-use-cases','role-impact','stakeholder-consultation','safeguards','training','monitoring','concern-management','evidence-review'],
    artefacts: ['workforce_impact_assessment','role_task_map','approved_use_catalogue','stakeholder_map','capability_analysis','training_pathway','communications_plan','manager_guide','employee_concern_register','adoption_quality_metrics','support_process','post_adoption_review'],
    hardGates: ['purpose','role_boundary','prohibited_actions','training','human_oversight','support_path','metric','review_owner'],
    acceptance: 'Every approved workforce use has purpose, role boundary, prohibited actions, training, human oversight, support path, metric and review owner.',
    metrics: ['trained_users','approved_use_adoption','quality_incidents','support_demand','manager_readiness','employee_confidence']
  },
  'RSP-051': {
    name: 'Training and Competency Assurance Kit', family: 'Leadership, Workforce & Operating System', cadence: 'role-cycle-plus-renewal',
    stages: ['competency-definition','learning-map','assessment-design','evidence-standard','assess','remediate','human-authorisation','renewal'],
    artefacts: ['role_competency_matrix','learning_objective_standard','curriculum_map','assessment_blueprint','competence_evidence_record','supervision_checklist','authorisation_register','refresher_schedule','remediation_log','trainer_assessor_criteria','dashboard','annual_review'],
    hardGates: ['role_requirement','assessment_evidence','assessor','result','limitations','authorisation','renewal_date'],
    acceptance: 'No person is recorded as competent without role requirement, assessment evidence, assessor, result, limitations, authorisation and renewal date.',
    metrics: ['competency_coverage','pass_rate','expired_authorisations','remediation_closure','refresher_completion','incident_linkage']
  },
  'RSP-052': {
    name: 'Knowledge Transfer and Succession Kit', family: 'Leadership, Workforce & Operating System', cadence: 'transition-plan-driven',
    stages: ['knowledge-inventory','dependency-priority','capture','recipient-assignment','shadow-practice','validation','continuity-test','human-handover-acceptance'],
    artefacts: ['knowledge_inventory','key_person_dependency_map','capture_plan','procedure_decision_rationale','system_access_register','recipient_assignment','shadowing_practice_plan','competence_validation','handover_acceptance','open_issues_register','continuity_test','readiness_dashboard'],
    hardGates: ['recipient_assigned','validation_method','recipient_can_perform_or_explain','owner_acceptance','remaining_gaps_recorded'],
    acceptance: 'Critical knowledge is not considered transferred until a recipient can perform or explain it under a defined validation method and owner acceptance.',
    metrics: ['knowledge_captured','single_person_dependencies','recipient_validation','handover_acceptance','continuity_test_pass','open_issue_age']
  },
  'RSP-053': {
    name: 'Internal Audit and Continuous Improvement Kit', family: 'Leadership, Workforce & Operating System', cadence: 'annual-risk-plan-plus-engagement-cycle',
    stages: ['audit-universe','risk-prioritisation','scope-approval','evidence-test','finding-classification','action-plan','closure-evidence','effectiveness-review','annual-summary'],
    artefacts: ['audit_universe','risk_based_plan','engagement_scope','test_programme','evidence_request','workpaper_template','finding_severity_model','root_cause_analysis','management_action_plan','closure_checklist','effectiveness_review','annual_assurance_summary'],
    hardGates: ['criterion','condition','evidence','risk','cause','owner','action','due_date','closure_evidence','effectiveness_result'],
    acceptance: 'Every finding has criterion, condition, evidence, risk, cause, owner, action, due date, closure evidence and effectiveness result.',
    metrics: ['plan_completion','high_findings','repeat_findings','closure_time','effectiveness_pass_rate','evidence_retrieval_time']
  }
};

export const LEADERSHIP_RUNTIME_IDS = Object.freeze(Object.keys(LEADERSHIP_RUNTIME_SPECS));
