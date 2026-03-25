import * as cdk from 'aws-cdk-lib';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as path from 'path';
import { Construct } from 'constructs';
import { SSM_PARAM_PREFIX } from '../utils/constants';

/**
 * Properties for the Aurora pgvector Stack
 * This stack creates the Aurora Serverless v2 database with pgvector extension
 */
export interface AuroraPgVectorStackProps extends cdk.StackProps {
  /** VPC for the Aurora cluster */
  vpc: ec2.IVpc;
  /** The name of the IAM role that Bedrock will use to access Aurora */
  bedrockRoleName: string;
  /** The name of the Bedrock Knowledge Base */
  knowledgeBaseName?: string;
  /** Database name */
  databaseName?: string;
  /** The name of the vector table */
  vectorTableName?: string;
}

/**
 * AWS CDK Stack for Aurora Serverless v2 with pgvector
 *
 * This stack creates the vector storage infrastructure required for Bedrock Knowledge Base:
 * - Aurora Serverless v2 PostgreSQL cluster with pgvector extension
 * - Security groups for database access
 * - IAM role for Bedrock to access the database
 * - Lambda function to initialize pgvector extension and create vector table
 *
 * Aurora Serverless v2 with pgvector provides cost-effective, auto-scaling vector database
 * capabilities for AI/ML workloads that need semantic search.
 */
export class AuroraPgVectorStack extends cdk.Stack {
  /** The Aurora database cluster */
  public readonly cluster: rds.DatabaseCluster;
  /** The database secret containing credentials */
  public readonly secret: secretsmanager.ISecret;
  /** The IAM role that allows Bedrock to access this Aurora cluster */
  public readonly bedrockRole: iam.Role;
  /** The S3 bucket for knowledge base documents */
  public readonly knowledgeBaseBucket: s3.Bucket;
  /** The Bedrock Knowledge Base ID */
  public readonly knowledgeBaseId: string;
  /** The Bedrock Data Source ID */
  public readonly dataSourceId: string;
  /** The database name */
  public readonly databaseName: string;
  /** The vector table name */
  public readonly vectorTableName: string;

  constructor(scope: Construct, id: string, props: AuroraPgVectorStackProps) {
    super(scope, id, props);

    const paramPrefix = SSM_PARAM_PREFIX;
    this.databaseName = props.databaseName || 'vectordb';
    this.vectorTableName = props.vectorTableName || 'bedrock_integration';

    // Create IAM role for Bedrock to access Aurora
    this.bedrockRole = new iam.Role(this, 'BedrockKnowledgeBaseRole', {
      roleName: props.bedrockRoleName,
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      description: 'IAM role for Bedrock to access Aurora PostgreSQL with pgvector',
    });

    // Create security group for Aurora
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'AuroraSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for Aurora PostgreSQL cluster',
      allowAllOutbound: true,
    });

    // Allow connections from within the VPC
    dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access from VPC'
    );

    // Create Aurora Serverless v2 cluster with PostgreSQL 15 (supports pgvector)
    this.cluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_15,
      }),
      credentials: rds.Credentials.fromGeneratedSecret('postgres', {
        secretName: `${this.stackName}/aurora-credentials`,
      }),
      defaultDatabaseName: this.databaseName,
      storageEncrypted: true,
      iamAuthentication: true,
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [dbSecurityGroup],
      writer: rds.ClusterInstance.serverlessV2('writer', {
        autoMinorVersionUpgrade: true,
        publiclyAccessible: false,
      }),
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 2,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      backup: {
        retention: cdk.Duration.days(7),
      },
      cloudwatchLogsExports: ['postgresql'],
      // Enable Data API v2 for Bedrock Knowledge Base
      enableDataApi: true,
    });

    this.secret = this.cluster.secret!;

    // Create Lambda function to initialize pgvector extension and create table
    const initPgVectorFunction = new NodejsFunction(this, 'InitPgVectorFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.resolve(__dirname, '../../../../packages/lambdas/init-pgvector/index.js'),
      handler: 'handler',
      bundling: {
        externalModules: ['@aws-sdk/*'],
      },
      timeout: cdk.Duration.minutes(10),
      environment: {
        SECRET_ARN: this.secret.secretArn,
        DATABASE_NAME: this.databaseName,
        TABLE_NAME: this.vectorTableName,
      },
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [dbSecurityGroup],
      description: 'Initializes pgvector extension and creates vector table in Aurora',
    });

    // Grant Lambda access to the database secret
    this.secret.grantRead(initPgVectorFunction);

    // Allow Lambda to connect to the database
    this.cluster.connections.allowFrom(
      initPgVectorFunction,
      ec2.Port.tcp(5432),
      'Allow Lambda to connect to Aurora'
    );

    // Create custom resource to initialize pgvector
    const initPgVector = new cdk.CustomResource(this, 'InitPgVector', {
      serviceToken: new cr.Provider(this, 'InitPgVectorProvider', {
        onEventHandler: initPgVectorFunction,
      }).serviceToken,
      properties: {
        ClusterEndpoint: this.cluster.clusterEndpoint.hostname,
        DatabaseName: this.databaseName,
        TableName: this.vectorTableName,
        ResourceId: `PgVector-${this.databaseName}-${this.vectorTableName}`,
        Version: '2.0',
      },
    });

    // Ensure proper resource creation order
    initPgVector.node.addDependency(this.cluster);

    // Grant Bedrock role access to the database secret
    this.secret.grantRead(this.bedrockRole);

    // Grant Bedrock comprehensive permissions
    this.bedrockRole.attachInlinePolicy(
      new iam.Policy(this, 'BedrockAuroraPolicy', {
        statements: [
          // Bedrock foundation model access for embeddings and generation
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              'bedrock:InvokeModel',
              'bedrock:InvokeModelWithResponseStream'
            ],
            resources: [
              `arn:aws:bedrock:*::foundation-model/*`,
              `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/*`,
              `arn:aws:bedrock:${this.region}:${this.account}:application-inference-profile/*`
            ],
          }),
          // Knowledge base operations
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['bedrock:Retrieve', 'bedrock:RetrieveAndGenerate'],
            resources: [`arn:aws:bedrock:${this.region}:${this.account}:knowledge-base/*`],
          }),
          // S3 access for knowledge base documents
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['s3:GetObject', 's3:ListBucket'],
            resources: [
              'arn:aws:s3:::*-knowledgebasebucket*',
              'arn:aws:s3:::*-knowledgebasebucket*/*',
            ],
          }),
          // RDS access for Aurora pgvector storage
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              'rds:DescribeDBClusters',
              'rds:DescribeDBInstances',
            ],
            resources: [
              `arn:aws:rds:${this.region}:${this.account}:cluster:*`,
              `arn:aws:rds:${this.region}:${this.account}:db:*`,
            ],
          }),
          // RDS Data API permissions for Bedrock to execute queries
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              'rds-data:ExecuteStatement',
              'rds-data:BatchExecuteStatement',
            ],
            resources: [
              `arn:aws:rds:${this.region}:${this.account}:cluster:*`,
            ],
          }),
          // KMS permissions for S3 encryption/decryption
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              'kms:Decrypt',
              'kms:DescribeKey',
              'kms:GenerateDataKey',
            ],
            resources: [
              `arn:aws:kms:${this.region}:${this.account}:key/*`,
            ],
            conditions: {
              StringEquals: {
                'kms:ViaService': [`s3.${this.region}.amazonaws.com`],
              },
            },
          }),
        ],
      })
    );

    // Create S3 bucket for knowledge base documents
    this.knowledgeBaseBucket = new s3.Bucket(this, 'KnowledgeBaseBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
    });

    // Grant Bedrock role access to the knowledge base bucket
    this.knowledgeBaseBucket.grantRead(this.bedrockRole);

    // Create Bedrock Knowledge Base with Aurora pgvector storage
    const knowledgeBaseName = props.knowledgeBaseName || 'AgentCoreKnowledgeBase';
    const knowledgeBase = new bedrock.CfnKnowledgeBase(this, 'KnowledgeBase', {
      name: knowledgeBaseName,
      description: 'Knowledge base for AgentCore Template with Aurora pgvector storage',
      roleArn: this.bedrockRole.roleArn,
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          // Using v2 with 1024-dimension vectors (better multilingual support, 100+ languages)
          embeddingModelArn: `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
        },
      },
      storageConfiguration: {
        type: 'RDS',
        rdsConfiguration: {
          resourceArn: this.cluster.clusterArn,
          credentialsSecretArn: this.secret.secretArn,
          databaseName: this.databaseName,
          tableName: this.vectorTableName,
          fieldMapping: {
            primaryKeyField: 'id',
            vectorField: 'embedding',
            textField: 'chunks',
            metadataField: 'metadata',
          },
        },
      },
    });

    // Ensure Knowledge Base is created after pgvector initialization
    knowledgeBase.node.addDependency(initPgVector);

    // Store Knowledge Base ID
    this.knowledgeBaseId = knowledgeBase.attrKnowledgeBaseId;

    // Create S3 Data Source for the Knowledge Base
    const dataSource = new bedrock.CfnDataSource(this, 'KnowledgeBaseDataSource', {
      knowledgeBaseId: this.knowledgeBaseId,
      name: 'S3DataSource',
      description: 'S3 data source for knowledge base documents',
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: {
          bucketArn: this.knowledgeBaseBucket.bucketArn,
        },
      },
      vectorIngestionConfiguration: {
        chunkingConfiguration: {
          chunkingStrategy: 'FIXED_SIZE',
          fixedSizeChunkingConfiguration: {
            maxTokens: 512,
            overlapPercentage: 20,
          },
        },
      },
    });

    // Store Data Source ID
    this.dataSourceId = dataSource.attrDataSourceId;

    // SSM Parameters
    new ssm.StringParameter(this, 'ClusterArnParameter', {
      parameterName: `${paramPrefix}/Aurora/ClusterArn`,
      stringValue: this.cluster.clusterArn,
      description: 'Aurora cluster ARN',
    });

    new ssm.StringParameter(this, 'ClusterEndpointParameter', {
      parameterName: `${paramPrefix}/Aurora/ClusterEndpoint`,
      stringValue: this.cluster.clusterEndpoint.hostname,
      description: 'Aurora cluster endpoint',
    });

    new ssm.StringParameter(this, 'SecretArnParameter', {
      parameterName: `${paramPrefix}/Aurora/SecretArn`,
      stringValue: this.secret.secretArn,
      description: 'Aurora database credentials secret ARN',
    });

    new ssm.StringParameter(this, 'DatabaseNameParameter', {
      parameterName: `${paramPrefix}/Aurora/DatabaseName`,
      stringValue: this.databaseName,
      description: 'Aurora database name',
    });

    new ssm.StringParameter(this, 'VectorTableNameParameter', {
      parameterName: `${paramPrefix}/Aurora/VectorTableName`,
      stringValue: this.vectorTableName,
      description: 'Vector table name for embeddings',
    });

    new ssm.StringParameter(this, 'BedrockRoleArnParameter', {
      parameterName: `${paramPrefix}/Aurora/BedrockRoleArn`,
      stringValue: this.bedrockRole.roleArn,
      description: 'IAM role ARN for Bedrock access',
    });

    // Knowledge Base SSM Parameters
    new ssm.StringParameter(this, 'KnowledgeBaseBucketParameter', {
      parameterName: `${paramPrefix}/KnowledgeBaseBucket`,
      stringValue: this.knowledgeBaseBucket.bucketName,
      description: 'S3 bucket for knowledge base documents',
    });

    new ssm.StringParameter(this, 'KnowledgeBaseIdParameter', {
      parameterName: `${paramPrefix}/KnowledgeBaseId`,
      stringValue: this.knowledgeBaseId,
      description: 'Bedrock Knowledge Base ID',
    });

    new ssm.StringParameter(this, 'DataSourceIdParameter', {
      parameterName: `${paramPrefix}/DataSourceId`,
      stringValue: this.dataSourceId,
      description: 'Bedrock Knowledge Base Data Source ID',
    });

    // CloudFormation outputs
    new cdk.CfnOutput(this, 'ClusterArn', {
      value: this.cluster.clusterArn,
      description: 'Aurora cluster ARN',
      exportName: `${this.stackName}-ClusterArn`,
    });

    new cdk.CfnOutput(this, 'ClusterEndpoint', {
      value: this.cluster.clusterEndpoint.hostname,
      description: 'Aurora cluster endpoint',
      exportName: `${this.stackName}-ClusterEndpoint`,
    });

    new cdk.CfnOutput(this, 'SecretArn', {
      value: this.secret.secretArn,
      description: 'Aurora database credentials secret ARN',
      exportName: `${this.stackName}-SecretArn`,
    });

    new cdk.CfnOutput(this, 'DatabaseName', {
      value: this.databaseName,
      description: 'Aurora database name',
      exportName: `${this.stackName}-DatabaseName`,
    });

    new cdk.CfnOutput(this, 'VectorTableName', {
      value: this.vectorTableName,
      description: 'Vector table name for embeddings',
      exportName: `${this.stackName}-VectorTableName`,
    });

    new cdk.CfnOutput(this, 'BedrockRoleArn', {
      value: this.bedrockRole.roleArn,
      description: 'IAM role ARN for Bedrock services',
      exportName: `${this.stackName}-BedrockRoleArn`,
    });

    // Knowledge Base CloudFormation Outputs
    new cdk.CfnOutput(this, 'KnowledgeBaseBucketName', {
      value: this.knowledgeBaseBucket.bucketName,
      description: 'S3 bucket for knowledge base documents',
      exportName: `${this.stackName}-KnowledgeBaseBucketName`,
    });

    new cdk.CfnOutput(this, 'KnowledgeBaseId', {
      value: this.knowledgeBaseId,
      description: 'Bedrock Knowledge Base ID',
      exportName: `${this.stackName}-KnowledgeBaseId`,
    });

    new cdk.CfnOutput(this, 'DataSourceId', {
      value: this.dataSourceId,
      description: 'Bedrock Knowledge Base Data Source ID',
      exportName: `${this.stackName}-DataSourceId`,
    });

    // Tag all resources
    cdk.Tags.of(this).add('Project', 'AgentCore');
  }
}
