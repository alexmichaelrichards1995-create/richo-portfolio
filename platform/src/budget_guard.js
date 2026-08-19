class BudgetGuard {
  constructor({ store, defaultDailyBudgetCents = 500, hardStopMultiplier = 1 } = {}) {
    this.store = store;
    this.defaultDailyBudgetCents = defaultDailyBudgetCents;
    this.hardStopMultiplier = hardStopMultiplier;
  }

  async check({ agentId, estimatedCostCents = 0 }) {
    const budget = this.store?.getAgentBudget
      ? await this.store.getAgentBudget(agentId)
      : { dailyBudgetCents: this.defaultDailyBudgetCents, dailySpendCents: 0 };

    const limit = Math.max(0, Number(budget.dailyBudgetCents ?? this.defaultDailyBudgetCents));
    const spent = Math.max(0, Number(budget.dailySpendCents ?? 0));
    const projected = spent + Math.max(0, Number(estimatedCostCents || 0));
    const hardLimit = Math.floor(limit * this.hardStopMultiplier);

    return {
      allowed: limit === 0 ? estimatedCostCents === 0 : projected <= hardLimit,
      agentId,
      dailyBudgetCents: limit,
      dailySpendCents: spent,
      estimatedCostCents,
      projectedSpendCents: projected,
      remainingCents: Math.max(0, hardLimit - spent),
      reason: projected <= hardLimit ? 'within_budget' : 'budget_exceeded'
    };
  }

  async record({ agentId, jobId, provider, model, estimatedCostCents = 0, actualCostCents = 0, inputTokens = 0, outputTokens = 0 }) {
    if (!this.store?.recordBudgetUsage) return;
    await this.store.recordBudgetUsage({
      agentId,
      jobId,
      provider,
      model,
      estimatedCostCents,
      actualCostCents,
      inputTokens,
      outputTokens
    });
  }
}

module.exports = { BudgetGuard };
