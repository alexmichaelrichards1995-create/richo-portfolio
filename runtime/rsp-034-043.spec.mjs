export const TRANSACTION_RUNTIME_SPECS = {
  'RSP-034': {
    name: 'Procurement Readiness Kit', family: 'Procurement, Market Access & Transactions', cadence: 'per-procurement-cycle-plus-quarterly-evidence-refresh',
    stages: ['pathway-map','requirement-inventory','evidence-assessment','gap-ownership','approval-routing','response-rehearsal','submission-gate','lessons'],
    artefacts: ['procurement_pathway_map','buyer_requirement_register','vendor_evidence_index','policy_certification_inventory','insurance_financial_checklist','security_privacy_pack','ethical_sourcing_checklist','commercial_approval_matrix','readiness_score','remediation_backlog','submission_gate','lessons_review'],
    hardGates: ['requirement_status','owner','source','expiry','disclosure_level','remediation_plan'],
    acceptance: 'Priority requirements have evidence status, owner, source, expiry, disclosure level and remediation plan.',
    metrics: ['requirements_evidenced','critical_gaps','response_lead_time','rejection_causes','approval_completion','evidence_currency']
  },
  'RSP-035': {
    name: 'RFP/RFQ Response Governance Kit', family: 'Procurement, Market Access & Transactions', cadence: 'per-bid',
    stages: ['qualify','parse-requirements','assign-owners','draft-evidence-backed-response','scope-price-control','red-team','human-signoff','archive-learn'],
    artefacts: ['opportunity_qualification','compliance_matrix','response_owner_matrix','approved_claim_library','evidence_register','solution_scope_schedule','pricing_approval','risk_exception_log','red_team_checklist','version_control','authorised_signoff','debrief_pack'],
    hardGates: ['mandatory_requirement_response','evidence','compliance_status','owner','approval','no_unsupported_commitment'],
    acceptance: 'Every mandatory requirement has response, evidence, compliance status, owner and approval; no unsupported commitment is released.',
    metrics: ['requirements_answered','evidence_backed_claim_rate','late_items','unauthorised_commitments','submission_defects','learning_closure']
  },
  'RSP-036': {
    name: 'Vendor Registration and Due-Diligence Pack', family: 'Procurement, Market Access & Transactions', cadence: 'annual-refresh-plus-per-registration',
    stages: ['disclosure-scope','evidence-gather','currency-check','response-library','approver-assignment','purchaser-copy','annual-refresh'],
    artefacts: ['corporate_profile','ownership_control_record','insurance_register','banking_verification_checklist','tax_registration_evidence','policy_catalogue','security_privacy_factsheet','service_subcontractor_profile','integrity_declaration_tracker','questionnaire_library','disclosure_gate','annual_refresh_schedule'],
    hardGates: ['fact_evidence_link','current_evidence','named_approval','disclosure_level','authorised_recipient'],
    acceptance: 'All disclosed facts link to current evidence and named approval; sensitive information has a defined disclosure level and recipient.',
    metrics: ['registration_turnaround','evidence_completeness','questionnaire_reuse','expired_evidence','disclosure_approvals','rework_rate']
  },
  'RSP-037': {
    name: 'Market Entry and Localisation Readiness Kit', family: 'Procurement, Market Access & Transactions', cadence: 'per-market-entry-decision',
    stages: ['market-thesis','assumption-map','local-evidence','localisation-assessment','entry-options','blocker-resolution','human-go-no-go','post-entry-review'],
    artefacts: ['market_thesis','segment_buyer_map','local_requirement_register','product_localisation_assessment','data_hosting_assessment','pricing_currency_tax_questions','channel_map','service_support_readiness','risk_assumption_register','entry_options_model','go_no_go_pack','post_entry_review'],
    hardGates: ['demand_assumptions','localisation_gaps','legal_tax_questions','delivery_readiness','risk_owners','exit_criteria','human_entry_decision'],
    acceptance: 'No entry recommendation is made without documented demand assumptions, localisation gaps, legal/tax questions, delivery readiness, risk owners and exit criteria.',
    metrics: ['assumptions_validated','localisation_gaps','readiness_score','decision_lead_time','risk_closure','post_entry_variance']
  },
  'RSP-038': {
    name: 'Partner and Channel Governance Kit', family: 'Procurement, Market Access & Transactions', cadence: 'partner-onboarding-plus-quarterly-review',
    stages: ['partner-type','qualification','rights-restrictions','lead-rules','training','performance-monitoring','conflict-review','exit'],
    artefacts: ['partner_profile','tier_model','responsibility_matrix','lead_registration_rules','commercial_incentive_schedule','approved_claims_brand_rules','competency_checklist','data_sharing_boundary','performance_scorecard','conflict_process','review_cadence','exit_checklist'],
    hardGates: ['approved_status','role','commercial_rules','data_boundary','training_state','performance_owner','termination_path'],
    acceptance: 'Every active partner has approved status, role, commercial rules, data boundary, training state, performance owner and termination path.',
    metrics: ['qualified_partners','lead_conflict_rate','partner_sourced_pipeline','training_completion','claim_breaches','partner_performance']
  },
  'RSP-039': {
    name: 'Contract Obligation and Evidence Register Kit', family: 'Procurement, Market Access & Transactions', cadence: 'monthly-obligation-review-plus-renewal-trigger',
    stages: ['contract-inventory','obligation-extraction','ownership','calendar-evidence','exception-review','renewal-termination-readiness'],
    artefacts: ['contract_inventory','obligation_extraction','taxonomy','owner_matrix','milestone_notice_calendar','evidence_schedule','dependency_register','waiver_exception_log','breach_escalation','periodic_review','renewal_termination_triggers','dashboard'],
    hardGates: ['source_clause_reference','owner','due_date','evidence','dependency','status','escalation_route'],
    acceptance: 'Each material obligation has source clause reference, owner, due date, evidence, dependency, status and escalation route.',
    metrics: ['obligations_assigned','evidence_current','missed_notices','open_exceptions','overdue_obligations','renewal_readiness']
  },
  'RSP-040': {
    name: 'Data Room Readiness Kit', family: 'Procurement, Market Access & Transactions', cadence: 'weekly-during-live-transaction',
    stages: ['perimeter','taxonomy','inventory','disclosure-classification','gap-remediation','access-approval','q_and_a','closing-archive'],
    artefacts: ['taxonomy','master_index','document_owner_matrix','evidence_checklist','redaction_disclosure_rules','version_currency_register','remediation_backlog','q_and_a_log','access_approval','download_revocation_log','review_cadence','closing_archive_checklist'],
    hardGates: ['category','owner','version','currency','disclosure_level','gap_status','approved_access_group'],
    acceptance: 'Every room item has category, owner, version, currency, disclosure level, gap status and approved access group.',
    metrics: ['required_items_available','critical_gaps','document_currency','q_and_a_response_time','access_exceptions','obsolete_records']
  },
  'RSP-041': {
    name: 'Investment Readiness Evidence Kit', family: 'Procurement, Market Access & Transactions', cadence: 'fundraise-stage-driven-plus-monthly-refresh',
    stages: ['funding-objective','claim-inventory','evidence-linkage','gap-assumption-review','risk-disclosure','diligence-rehearsal','human-external-use-approval'],
    artefacts: ['investment_thesis_evidence_map','business_model_factsheet','market_evidence','traction_schedule','unit_economics_questions','product_roadmap_index','team_governance_pack','risk_register','ip_data_checklist','funding_use_plan','claim_approval','diligence_q_and_a_library'],
    hardGates: ['claim_source','claim_date','claim_owner','limitation','disclosure_approval','unresolved_gaps_not_fact'],
    acceptance: 'Each material claim has source, date, owner, limitation and disclosure approval; unresolved gaps are not represented as fact.',
    metrics: ['claims_evidenced','critical_gaps','diligence_response_time','financial_assumption_traceability','risk_disclosure','refresh_rate']
  },
  'RSP-042': {
    name: 'M&A Seller Readiness Kit', family: 'Procurement, Market Access & Transactions', cadence: 'transaction-stage-driven',
    stages: ['transaction-perimeter','asset-dependency-map','evidence-transferability','blocker-review','disclosure-control','transition-design','human-stage-approval'],
    artefacts: ['transaction_perimeter','asset_liability_schedule','commercial_evidence_index','concentration_analysis','ip_title_checklist','owner_dependency_map','transferability_assessment','risk_disclosure_register','buyer_q_and_a_library','offer_evaluation_criteria','transition_plan','seller_decision_ledger'],
    hardGates: ['material_assets_documented','obligations_documented','dependencies_documented','risks_documented','evidence_gaps_owned','treatment_defined_before_disclosure'],
    acceptance: 'Material assets, obligations, dependencies, risks and evidence gaps are documented with owners and treatment before buyer disclosure.',
    metrics: ['critical_gaps','transferability_score','owner_dependency','evidence_completeness','q_and_a_cycle_time','blocker_closure']
  },
  'RSP-043': {
    name: 'IP Licensing Readiness Kit', family: 'Procurement, Market Access & Transactions', cadence: 'per-licence-plus-renewal-cycle',
    stages: ['asset-boundary','ownership-evidence','dependency-map','rights-options','restriction-design','commercial-scenarios','legal-routing','delivery-renewal-control'],
    artefacts: ['ip_asset_schedule','ownership_evidence_index','dependency_register','licence_scope_matrix','territory_term_user_options','permitted_prohibited_use','support_update_options','commercial_scenario_model','purchaser_diligence_checklist','licence_issuance_record','delivery_acceptance','renewal_termination_register'],
    hardGates: ['asset_version','licensor','licensee','permitted_use','excluded_use','term','territory','users','dependencies','fees','support','delivery','human_approval'],
    acceptance: 'Every proposed licence identifies asset version, licensor, licensee, permitted use, excluded use, term, territory, users, dependencies, fees, support, delivery and approval.',
    metrics: ['assets_with_title_evidence','licence_exceptions','delivery_completeness','unauthorised_use','renewal_rate','support_demand']
  }
};

export const TRANSACTION_RUNTIME_IDS = Object.freeze(Object.keys(TRANSACTION_RUNTIME_SPECS));
