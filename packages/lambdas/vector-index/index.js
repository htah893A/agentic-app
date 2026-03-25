const { RDSDataClient, ExecuteStatementCommand } = require('@aws-sdk/client-rds-data');

const rds = new RDSDataClient({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  const { RequestType, PhysicalResourceId } = event;
  const { ClusterArn, SecretArn, DatabaseName, TableName, VectorDimension } = event.ResourceProperties;
  const resourceId = PhysicalResourceId || `PgVector-${DatabaseName}-${TableName}`;
  const dimension = VectorDimension || 1024;

  if (RequestType === 'Delete') {
    console.log('Delete request - skipping table drop for safety');
    return { PhysicalResourceId: resourceId };
  }

  if (RequestType === 'Create' || RequestType === 'Update') {
    const params = { resourceArn: ClusterArn, secretArn: SecretArn, database: DatabaseName };

    await execute(params, 'CREATE EXTENSION IF NOT EXISTS vector');

    await execute(params, `
      CREATE TABLE IF NOT EXISTS ${TableName} (
        id TEXT PRIMARY KEY,
        embedding vector(${dimension}),
        content TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await execute(params, `
      CREATE INDEX IF NOT EXISTS ${TableName}_embedding_idx
      ON ${TableName} USING hnsw (embedding vector_l2_ops)
      WITH (m = 16, ef_construction = 128)
    `);

    await execute(params, `
      CREATE INDEX IF NOT EXISTS ${TableName}_created_at_idx
      ON ${TableName} (created_at)
    `);

    console.log(`pgvector table "${TableName}" with dimension ${dimension} ready`);
    return {
      PhysicalResourceId: resourceId,
      Data: { TableName, DatabaseName, Status: 'Created' },
    };
  }

  throw new Error(`Unsupported request type: ${RequestType}`);
};

async function execute(params, sql) {
  console.log('Executing:', sql.trim().split('\n')[0]);
  return rds.send(new ExecuteStatementCommand({ ...params, sql }));
}
