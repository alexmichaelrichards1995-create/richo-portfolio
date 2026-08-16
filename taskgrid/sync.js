'use strict';

async function syncNotionToDurable({ notion, durableStore, pageSize = 100 }) {
  if (!notion) throw new Error('notion_adapter_required');
  if (!durableStore?.upsertControlPlaneTask) throw new Error('durable_upsert_required');

  const tasks = await notion.listDispatcherTasks({ pageSize });
  let upserted = 0;
  for (const task of tasks) {
    await durableStore.upsertControlPlaneTask(task);
    upserted++;
  }
  return { fetched: tasks.length, upserted };
}

module.exports = { syncNotionToDurable };
