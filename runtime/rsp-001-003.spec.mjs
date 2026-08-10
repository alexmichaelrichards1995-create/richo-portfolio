export const FOUNDATION_RUNTIME_SPECS = {
  'RSP-001': {
    name: 'AI Governance Starter Kit',
    family: 'Foundation',
    cadence: 'per-use-case-plus-material-change-and-incident-review',
    stages: ['executive-owner','use-case-intake','risk-tiering','prohibited-use-control','decision-rights','human-review','evidence-and-monitoring','incident-escalation','vendor-diligence','executive-acceptance','recurring-review'],
    artefacts: [
      'ai_use_case_intake',
      'decision_right_matrix',
      'practical_risk_tiering',
      'prohibited_use_register',
      'human_review_protocol',
      'evidence_register',
      'incident_escalation_log',
      'vendor_due_diligence_checklist',
      'implementation_30_day_plan',
      'executive_acceptance_checklist',
      'decision_receipt',
      'approved_use_and_retirement_record'
    ],
    hardGates: [
      'accountable_human_owner_named',
      'risk_classified_before_access_or_deployment',
      'prohibited_uses_explicitly_controlled',
      'consequential_final_authority_remains_human',
      'data_use_and_access_authorised',
      'testing_covers_success_and_failure_modes',
      'meaningful_human_review_is_operational',
      'stop_triggers_and_incident_path_operational',
      'vendor_dependencies_and_limitations_reviewed',
      'approval_expiry_and_reassessment_date_recorded'
    ],
    acceptance: 'A use case can reach human approval only when purpose, boundaries, accountable owners, authorised data use, justified risk tier, prohibited-use controls, realistic testing, meaningful human review, monitoring, incident response, fallback, vendor dependencies, approval duration and review date are evidenced.',
    metrics: ['use_cases_inventoried','owner_coverage','risk_tier_coverage','prohibited_use_exceptions','human_review_coverage','evidence_currency','incident_count','stop_trigger_response_time','vendor_review_currency','expired_assessments','reassessment_completion','retired_use_cases']
  },
  'RSP-002': {
    name: 'Paid Pilot Readiness Kit',
    family: 'Foundation',
    cadence: 'per-pilot-plus-weekly-evidence-review-and-closeout',
    stages: ['qualification','pilot-charter','scope-exclusions','baseline-metrics','raci-decision-rights','data-security-environment','raid-control','change-control','weekly-evidence','acceptance-review','closeout-conversion'],
    artefacts: [
      'pilot_qualification_scorecard',
      'pilot_charter',
      'scope_and_exclusions_worksheet',
      'baseline_metric_attribution_register',
      'pilot_raci_decision_rights',
      'data_access_security_environment_checklist',
      'risk_assumption_issue_dependency_register',
      'change_control_request',
      'weekly_pilot_evidence_report',
      'acceptance_protocol',
      'pilot_closeout_conversion_decision',
      'commercial_proposal_quality_gate'
    ],
    hardGates: [
      'named_customer_and_provider_owners_exist',
      'problem_and_baseline_are_evidenced',
      'scope_exclusions_and_dependencies_are_explicit',
      'data_and_system_access_are_authorised_and_least_privilege',
      'security_privacy_procurement_path_is_understood',
      'budget_or_paid_pilot_authority_exists',
      'success_metrics_and_acceptance_are_objective',
      'material_changes_require_recorded_human_approval',
      'permanent_blockers_are_clear',
      'production_conversion_requires_separate_human_approval'
    ],
    acceptance: 'Pilot readiness requires an evidenced problem and baseline, bounded paid scope, authorised data/access, named decision rights, objective measures, explicit stop conditions, controlled change, sufficient weekly evidence and a named-human acceptance or closeout decision. A high qualification score never overrides a blocker.',
    metrics: ['qualification_score','baseline_coverage','metric_reliability','scope_change_count','open_raid_items','access_control_completion','weekly_evidence_currency','acceptance_items_met','claims_prohibited_count','pilot_state','closeout_decision_latency','conversion_readiness']
  },
  'RSP-003': {
    name: 'Buyer-Ready IP and Due-Diligence Kit',
    family: 'Foundation',
    cadence: 'per-transaction-plus-access-review-and-evidence-refresh',
    stages: ['asset-inventory','chain-of-title','dependency-review','claim-evidence','gap-remediation','data-room-control','disclosure-redaction','buyer-questions','access-control','transfer-readiness','management-signoff'],
    artefacts: [
      'ip_asset_register',
      'chain_of_title_checklist',
      'contributor_third_party_dependency_register',
      'claim_evidence_matrix',
      'evidence_gap_remediation_backlog',
      'controlled_data_room_index',
      'disclosure_redaction_gate',
      'buyer_question_response_library',
      'access_control_revocation_log',
      'transfer_readiness_checklist',
      'management_diligence_signoff',
      'transaction_readiness_dashboard'
    ],
    hardGates: [
      'material_assets_have_stable_ids_and_evidence_status',
      'ownership_is_distinguished_from_possession_or_access',
      'p0_title_authority_and_transfer_blockers_are_resolved_or_disclosed',
      'third_party_and_open_source_restrictions_are_recorded',
      'material_claims_are_evidence_bounded',
      'privileged_secrets_personal_and_restricted_information_are_not_overdisclosed',
      'recipient_purpose_nda_and_disclosure_stage_are_verified',
      'data_room_access_is_named_least_privilege_and_revocable',
      'transfer_dependencies_and_rotation_or_deletion_plans_are documented'.replace(' are documented','_are_documented'),
      'named_human_management_signoff_records_unresolved_material_issues'
    ],
    acceptance: 'Transaction readiness remains blocked while any ownership, authority, legal-disclosure, data or integrity P0 blocker is unresolved. Material claims must link to evidence, sensitive disclosure must be controlled, and transferability must be evidenced rather than inferred from possession.',
    metrics: ['asset_inventory_coverage','title_evidence_coverage','p0_blockers','third_party_dependency_coverage','claims_evidenced','critical_gaps','data_room_currency','disclosure_blocks','access_exceptions','revocation_completion','transfer_readiness_score','buyer_question_response_time']
  }
};

export const FOUNDATION_RUNTIME_IDS = Object.freeze(Object.keys(FOUNDATION_RUNTIME_SPECS));
