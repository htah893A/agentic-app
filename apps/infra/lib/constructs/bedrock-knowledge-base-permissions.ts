import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface BedrockKnowledgeBasePermissionsProps {
  roleName: string;
  auroraClusterArn: string;
  auroraSecretArn: string;
  region: string;
}

export class BedrockKnowledgeBasePermissions extends Construct {
  constructor(scope: Construct, id: string, props: BedrockKnowledgeBasePermissionsProps) {
    super(scope, id);

    const role = iam.Role.fromRoleName(this, 'BedrockKnowledgeBaseRole', props.roleName);

    new iam.Policy(this, 'AuroraDataApiPolicy', {
      policyName: 'BedrockKnowledgeBaseAuroraAccess',
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'rds-data:ExecuteStatement',
            'rds-data:BatchExecuteStatement',
            'rds:DescribeDBClusters',
          ],
          resources: [props.auroraClusterArn],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['secretsmanager:GetSecretValue'],
          resources: [props.auroraSecretArn],
        }),
      ],
    }).attachToRole(role);

    new iam.Policy(this, 'BedrockModelAccessPolicy', {
      policyName: 'BedrockKnowledgeBaseModelAccess',
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
          resources: [
            `arn:aws:bedrock:${props.region}::foundation-model/amazon.titan-embed-text-v1`,
            `arn:aws:bedrock:${props.region}::foundation-model/anthropic.claude-sonnet-4-20250514-v1:0`,
          ],
        }),
      ],
    }).attachToRole(role);
  }
}
