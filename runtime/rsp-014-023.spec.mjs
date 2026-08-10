export const COMMERCIAL_RUNTIME_SPECS = {
  'RSP-014': {
    name: 'Offer Architecture Builder',
    family: 'Commercial & Revenue',
    cadence: 'per-offer-plus-quarterly-review',
    stages: ['segment-definition','problem-evidence','outcome-design','scope-design','proof-map','economics-review','human-release-approval'],
    artefacts: ['ideal_customer_profile','buyer_problem_hierarchy','outcome_definition','solution_boundary','deliverables_schedule','assumption_register','proof_inventory','risk_reversal_options','service_levels','exclusions','offer_comparison_matrix','approval_record'],
    hardGates: ['target_segment_defined','problem_evidenced','measurable_outcome','deliverables_bounded','exclusions_explicit','proof_mapped','price_basis_defined','fulfilment_owner','human_release_approval'],
    acceptance: 'The offer states who it is for, the problem, measurable outcome, included work, exclusions, dependencies, evidence, price basis, fulfilment owner and approval status.',
    metrics: ['offer_conversion','scope_variance','gross_margin','proof_coverage','sales_cycle_duration','exception_frequency']
  },
  'RSP-015': {
    name: 'Pricing and Packaging Decision Kit',
    family: 'Commercial & Revenue',
    cadence: 'quarterly-and-per-material-price-change',
    stages: ['pricing-objective','segment-map','value-metric','cost-floor','package-design','scenario-test','discount-authority','human-approval','experiment-review'],
    artefacts: ['pricing_objective','customer_segment_map','value_metric_assessment','willingness_to_pay_log','cost_to_serve_model','package_architecture','discount_guardrails','approval_matrix','scenario_model','experiment_plan','exception_register','quarterly_review_pack'],
    hardGates: ['rationale_present','target_segment','value_metric','cost_basis','margin_expectation','approved_range','discount_rule','owner','review_date'],
    acceptance: 'Every active price has a rationale, target segment, value metric, cost basis, margin expectation, approved range, discount rule, owner and review date.',
    metrics: ['average_selling_price','discount_rate','gross_margin','package_mix','exception_rate','win_loss_by_price']
  },
  'RSP-016': {
    name: 'Enterprise Proposal and Quote Integrity Kit',
    family: 'Commercial & Revenue',
    cadence: 'per-proposal',
    stages: ['opportunity-qualification','requirements-trace','claim-evidence','scope-boundary','economics','exception-routing','commitment-review','human-release'],
    artefacts: ['opportunity_brief','requirements_traceability','claim_evidence_checklist','scope_schedule','assumptions_dependencies','pricing_approval','discount_exception','legal_security_routing','version_log','commitment_register','release_checklist','post_award_handoff'],
    hardGates: ['material_claims_evidenced_or_qualified','scope_explicit','exclusions_explicit','price_approved','discounts_approved','version_recorded','commitments_authorised','human_release_approval'],
    acceptance: 'All material claims are evidenced or qualified; scope and exclusions are explicit; price and discounts are approved; versions and authorised commitments are recorded.',
    metrics: ['proposal_cycle_time','unauthorised_commitments','quote_error_rate','discount_leakage','scope_clarification_rate','handoff_completeness']
  },
  'RSP-017': {
    name: 'Sales Qualification and Deal-Control System',
    family: 'Commercial & Revenue',
    cadence: 'weekly-pipeline-review',
    stages: ['qualification','problem-verification','buyer-map','decision-path','risk-review','next-commitment','forecast-review','advance-or-disqualify'],
    artefacts: ['qualification_criteria','stage_rules','problem_evidence_form','budget_authority_map','decision_process_map','competition_status_quo','commercial_risk_register','next_step_log','deal_review_agenda','forecast_model','disqualification_record','win_loss_review'],
    hardGates: ['verified_problem','buyer_roles_named','decision_path_known','next_commitment_defined','risks_recorded','value_hypothesis','evidence_based_forecast'],
    acceptance: 'Every active opportunity has a verified problem, named buyer roles, decision path, next commitment, risks, value hypothesis and evidence-based forecast state.',
    metrics: ['stage_conversion','forecast_accuracy','stalled_deal_age','qualification_completeness','no_decision_rate','sales_cycle_duration']
  },
  'RSP-018': {
    name: 'Buyer Consensus and Stakeholder Mapping Kit',
    family: 'Commercial & Revenue',
    cadence: 'per-opportunity-stage',
    stages: ['stakeholder-inventory','role-influence-map','decision-rights','needs-objections','engagement-ownership','consensus-risk','stage-review'],
    artefacts: ['stakeholder_inventory','role_influence_map','decision_rights_map','success_criteria_matrix','objection_register','evidence_needs_map','engagement_plan','champion_plan','consensus_risk_score','meeting_preparation','milestone_tracker','post_decision_review'],
    hardGates: ['material_decision_roles_mapped','legitimate_business_purpose','concerns_owned','evidence_requests_owned','engagement_owner_assigned','consensus_risk_assessed'],
    acceptance: 'All material decision roles are mapped; engagement activity has a legitimate business purpose; concerns and evidence requests have owners and statuses.',
    metrics: ['stakeholder_coverage','unresolved_objections','decision_slippage','champion_strength','consensus_risk','multi_threading_ratio']
  },
  'RSP-019': {
    name: 'Value Hypothesis and ROI Evidence Kit',
    family: 'Commercial & Revenue',
    cadence: 'per-value-case-and-measurement-cycle',
    stages: ['decision-use','baseline','metric-definition','cost-confounders','evidence-collection','sensitivity-review','human-acceptance'],
    artefacts: ['value_hypothesis','baseline_plan','metric_dictionary','benefit_formula_register','cost_model','attribution_confounder_map','measurement_cadence','evidence_register','acceptance_protocol','sensitivity_analysis','benefits_report','claim_approval'],
    hardGates: ['source_data','formula_defined','assumptions_recorded','attribution_method','confidence_recorded','owner','measurement_period','acceptance_status'],
    acceptance: 'Each value claim identifies source data, formula, assumptions, attribution method, confidence, owner, period and acceptance status.',
    metrics: ['baseline_coverage','metric_reliability','accepted_benefit','attribution_confidence','realisation_rate','claim_exceptions']
  },
  'RSP-020': {
    name: 'Customer Success Outcome Operating Kit',
    family: 'Commercial & Revenue',
    cadence: 'customer-review-cadence',
    stages: ['outcome-charter','baseline','onboarding','adoption','evidence-monitoring','business-review','risk-escalation','acceptance-lessons'],
    artefacts: ['outcome_charter','success_metric_plan','onboarding_checklist','stakeholder_map','adoption_plan','risk_blocker_log','health_score_definition','value_evidence_register','business_review_pack','escalation_protocol','acceptance_record','closure_review'],
    hardGates: ['outcomes_documented','metrics_defined','stakeholders_mapped','risks_tracked','evidence_sources_defined','review_cadence','escalation_route'],
    acceptance: 'Each customer has documented outcomes, metrics, stakeholders, risks, evidence sources, review cadence and escalation route.',
    metrics: ['time_to_first_value','adoption','outcome_attainment','risk_closure','executive_review_cadence','customer_acceptance']
  },
  'RSP-021': {
    name: 'Renewal and Expansion Readiness Kit',
    family: 'Commercial & Revenue',
    cadence: 'renewal-calendar-driven',
    stages: ['lead-time-open','account-score','value-usage-evidence','stakeholder-continuity','risk-options','human-commercial-approval','decision','handoff'],
    artefacts: ['renewal_calendar','readiness_score','value_summary','usage_adoption_review','stakeholder_continuity_map','risk_objection_register','commercial_options','expansion_hypothesis','approval_routing','meeting_pack','decision_log','post_renewal_handoff'],
    hardGates: ['renewal_owner','renewal_date','value_evidence','risk_status','stakeholder_map','approved_options','decision_plan'],
    acceptance: 'No material renewal reaches final period without owner, date, value evidence, risk status, stakeholder map, approved options and decision plan.',
    metrics: ['forecast_accuracy','gross_retention','expansion_pipeline','at_risk_age','evidence_completeness','late_renewal_rate']
  },
  'RSP-022': {
    name: 'Revenue Leakage and Entitlement Control Kit',
    family: 'Commercial & Revenue',
    cadence: 'monthly-reconciliation-plus-quarterly-control-test',
    stages: ['revenue-map','entitlement-source','usage-evidence','reconciliation','leakage-classification','human-recovery-approval','root-cause-remediation','retest'],
    artefacts: ['revenue_stream_map','contract_entitlement_matrix','usage_evidence_spec','billing_checklist','discount_credit_register','leakage_taxonomy','exception_workflow','reconciliation_procedure','recovery_case','root_cause_analysis','dashboard','quarterly_control_test'],
    hardGates: ['contractual_basis','entitlement_rule','usage_source','billing_treatment','exception_path','owner','human_recovery_approval'],
    acceptance: 'Every material charge has a contractual basis, entitlement rule, usage source, billing treatment, exception path and owner.',
    metrics: ['leakage_identified','leakage_recovered','billing_accuracy','entitlement_exceptions','reconciliation_completion','repeat_root_causes']
  },
  'RSP-023': {
    name: 'Commercial Experiment Governance Kit',
    family: 'Commercial & Revenue',
    cadence: 'per-experiment',
    stages: ['intake','hypothesis','metric-guardrail','risk-screen','human-approval','execution-evidence','data-quality','analysis','scale-stop-retest'],
    artefacts: ['experiment_intake','hypothesis_template','metric_guardrail_plan','sample_duration_rationale','risk_ethics_screen','approval','implementation_checklist','data_quality_check','analysis_plan','decision_rule','results_report','learning_repository'],
    hardGates: ['owner','hypothesis','target_population','measures','guardrails','duration','evidence_plan','human_approval'],
    acceptance: 'No experiment begins without owner, hypothesis, target population, measures, guardrails, duration, evidence plan and approval.',
    metrics: ['preregistered_experiments','guardrail_breaches','time_to_decision','inconclusive_rate','learning_reuse','closure_completion']
  }
};

export const COMMERCIAL_RUNTIME_IDS = Object.freeze(Object.keys(COMMERCIAL_RUNTIME_SPECS));
