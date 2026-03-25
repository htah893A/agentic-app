const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { Client } = require('pg');

const secretsManager = new SecretsManagerClient();

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  const requestType = event.RequestType;
  if (requestType === 'Delete') {
    return { Status: 'SUCCESS', PhysicalResourceId: event.PhysicalResourceId };
  }

  const secretArn = process.env.SECRET_ARN;
  const databaseName = process.env.DATABASE_NAME || 'vectordb';
  const tableName = process.env.TABLE_NAME || 'bedrock_integration';

  const { SecretString } = await secretsManager.send(
    new GetSecretValueCommand({ SecretId: secretArn })
  );
  const secret = JSON.parse(SecretString);

  const client = new Client({
    host: secret.host,
    port: secret.port || 5432,
    user: secret.username,
    password: secret.password,
    database: databaseName,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        embedding vector(1024),
        chunks text,
        metadata jsonb
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS ${tableName}_embedding_idx
      ON ${tableName} USING hnsw (embedding vector_cosine_ops);
    `);
    // Create full-text search index on chunks column (required by Bedrock)
    await client.query(`
      CREATE INDEX IF NOT EXISTS ${tableName}_chunks_idx
      ON ${tableName} USING gin (to_tsvector('english', chunks));
    `);
    console.log('pgvector initialization complete');
  } finally {
    await client.end();
  }

  return { Status: 'SUCCESS', PhysicalResourceId: `pgvector-${databaseName}-${tableName}` };
};
