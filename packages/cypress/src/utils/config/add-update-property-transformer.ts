import {
  CallExpression,
  Expression,
  createPrinter,
  createSourceFile,
  isCallExpression,
  isExportAssignment,
  isNumericLiteral,
  isObjectLiteralExpression,
  isPropertyAssignment,
  isStringLiteralLike,
  Node,
  NodeFactory,
  ObjectLiteralExpression,
  PropertyAssignment,
  ScriptTarget,
  SourceFile,
  transform,
  TransformationContext,
  TransformerFactory,
  visitEachChild,
  visitNode,
  Visitor,
  SyntaxKind,
} from 'typescript';
import {
  CypressConfig,
  isBooleanLiteral,
  Overwrite,
} from './transformer.helper';

export type CypressConfigPt2 = Overwrite<
  CypressConfig,
  {
    component: Overwrite<
      CypressConfig['component'],
      { devServer: { tsConfig: string; compiler: string } }
    >;
  }
>;

export function mergeCypressConfigs(
  newConfig: CypressConfigPt2,
  overwrite: boolean
): TransformerFactory<SourceFile> {
  return (context: TransformationContext) => {
    return (sourceFile: SourceFile) => {
      const visitor: Visitor = (node: Node): Node => {
        if (isExportAssignment(node)) {
          const callExpression = node.expression as CallExpression;

          const rootConfigNode = callExpression
            .arguments[0] as ObjectLiteralExpression;

          return context.factory.updateExportAssignment(
            node,
            node.decorators,
            node.modifiers,
            context.factory.updateCallExpression(
              callExpression,
              callExpression.expression,
              callExpression.typeArguments,
              overwrite
                ? [] // TODO(caleb): recursively create properties based on the new config
                : [visitRootConfigNode(context, rootConfigNode, newConfig)]
            )
          );
        }

        return visitEachChild(node, visitor, context);
      };

      return visitNode(sourceFile, visitor);
    };
  };
}

type PrimitiveValue = string | number | boolean;
type DevServer = {
  [key in 'tsConfig' | 'compiler']?: PrimitiveValue;
};

export class CypressPropertyTransformer {
  private static configMetadataMap = new Map<
    string,
    PrimitiveValue | Map<string, PrimitiveValue | DevServer>
  >();

  static addOrUpdate(
    existingConfigContent: string,
    newConfig: CypressConfigPt2,
    overwrite = false
  ): string {
    const sourceFile = createSourceFile(
      'cypress.config.ts',
      existingConfigContent,
      ScriptTarget.Latest,
      true
    );

    const transformedResult = transform(sourceFile, [
      // mergeCypressConfigs(config, overwrite),
    ]);

    return createPrinter().printFile(transformedResult.transformed[0]);
  }

  private static mergeConfigs(
    newConfig: CypressConfigPt2,
    overwrite: boolean
  ): TransformerFactory<SourceFile> {
    return (context: TransformationContext) => {
      // before visiting the sourceFile (aka the existing config)
      // we add the newConfig, as TypeScript AST, to our ConfigMetadata
      this.addNewConfigToMetadata(context.factory, newConfig);

      return (sourceFile: SourceFile) => {
        const nodeVisitor: Visitor = (node: Node): Node => {
          if (isExportAssignment(node)) {
            const callExpression = node.expression as CallExpression;
            const rootConfigNode = callExpression
              .arguments[0] as ObjectLiteralExpression;

            // return the updated export
            //  return the callExpression
            //   return the objectLiteralExpression
            //     within object literal expression (as the propertyAssignment)
            // iterate the map recursively to create properties on that object literal expression

            return node;
          }

          return visitEachChild(node, nodeVisitor, context);
        };

        return visitNode(sourceFile, nodeVisitor);
      };
    };
  }

  private static addNewConfigToMetadata(
    factory: NodeFactory,
    newConfig: CypressConfigPt2
  ): void {
    const propertyAssignments: PropertyAssignment[] = Object.entries(
      newConfig
    ).map(([configKey, configValue]) =>
      createPropertyAssignment(factory, configKey, configValue)
    );

    this.buildMetadataFromConfig(
      factory.createObjectLiteralExpression(propertyAssignments, true)
    );
  }

  private static buildMetadataFromConfig(
    factory: NodeFactory,
    config: ObjectLiteralExpression,
    metadataMap = this.configMetadataMap,
    merge = false
  ): void {
    if (merge) {
      return;
    }

    for (const property of config.properties) {
      const assignment = property as PropertyAssignment;
      const assignmentName = assignment.name.getText();

      if (assignmentName === 'devServer') {
        const oldDs = assignment.initializer as ObjectLiteralExpression;
        oldDs.properties; // TODO get the args from the old devServer
        const ds = factory.createCallExpression(
          factory.createIdentifier('devServer'),
          undefined,
          [assignment.initializer]
        );
      }

      if (isObjectLiteralExpression(assignment.initializer)) {
        const childMetadataMap = new Map();
        metadataMap.set(assignmentName, childMetadataMap);
        this.buildMetadataFromConfig(assignment.initializer, childMetadataMap);
      } else {
        metadataMap.set(
          assignmentName,
          this.fromLiteralToPrimitive(assignment.initializer)
        );
      }
    }

    // if (parentPath) {
    //   const parentMetadataMap = this.configMetadataMap.get(parentPath);
    //
    //   if (
    //     parentMetadataMap === undefined ||
    //     !(parentMetadataMap instanceof Map)
    //   )
    //     return;
    //
    // }
    //
    // if (this.configMetadataMap.size) {
    //   // merge
    // } else {
    //   for (const property of config.properties) {
    //     const assignment = property as PropertyAssignment;
    //     if (isObjectLiteralExpression(assignment.initializer)) {
    //     } else {
    //       this.configMetadataMap.set(
    //         assignment.name.getText(),
    //         this.fromLiteralToPrimitive(assignment.initializer)
    //       );
    //     }
    //   }
    // }
  }

  private static fromLiteralToPrimitive(
    nodeInitializer: Expression
  ): PrimitiveValue {
    if (isNumericLiteral(nodeInitializer)) {
      return parseInt(nodeInitializer.getText(), 10);
    }

    if (isBooleanLiteral(nodeInitializer)) {
      if (nodeInitializer.kind === SyntaxKind.TrueKeyword) {
        return true;
      }

      if (nodeInitializer.kind === SyntaxKind.FalseKeyword) {
        return false;
      }
    }

    return nodeInitializer.getText();
  }
}

// return (sourceFile: SourceFile) => {
//   const visitor: Visitor = (node: Node): Node => {
//     if (isExportAssignment(node)) {
//       const callExpression = node.expression as CallExpression;
//
//       const rootConfigNode = callExpression
//         .arguments[0] as ObjectLiteralExpression;
//
//       return context.factory.updateExportAssignment(
//         node,
//         node.decorators,
//         node.modifiers,
//         context.factory.updateCallExpression(
//           callExpression,
//           callExpression.expression,
//           callExpression.typeArguments,
//           overwrite
//             ? [] // TODO(caleb): recursively create properties based on the new config
//             : [visitRootConfigNode(context, rootConfigNode, newConfig)]
//         )
//       );
//     }
//
//     return visitEachChild(node, visitor, context);
//   };
//
//   return visitNode(sourceFile, visitor);
// };

export function createExpressionFromFunction(
  context: TransformationContext,
  fn: any
): CallExpression {
  if (typeof fn !== 'function') {
    console.log('function type was not provided');
    return;
  }
  const strFn = fn.toString();
  const fnArgMatcher = /\([\s\S)]+?(?=\))/g; // TODO(caleb): can I get a non matching capture group for the first '('? 🤔
  const fnNameMatcher = /\b\S+(?=\()/g;
  const fnName = strFn.match(fnNameMatcher)[0];
  const fnArgs = strFn
    .match(fnArgMatcher)
    .split(',')
    .map((s) => {
      // TODO(caleb): parse args into correct types.
      return s.trim();
    });

  return context.factory.createCallExpression(
    context.factory.createIdentifier(fnName),
    undefined,
    fnArgs.map((arg) => {
      switch (typeof arg) {
        case 'string':
          return context.factory.createStringLiteral(arg, true);
        case 'number':
          return context.factory.createNumericLiteral(arg);
        case 'boolean':
          return arg
            ? context.factory.createTrue()
            : context.factory.createFalse();
      }
    })
  );
}

function getValueByPath(config: CypressConfigPt2, path: string[]): unknown {
  return path.reduce((acc, key) => {
    return acc?.[key];
  }, config);
}

function updateChildObjectLiteral(
  context: TransformationContext,
  objectNode: ObjectLiteralExpression,
  path: string[],
  config: CypressConfigPt2
): ObjectLiteralExpression {
  const propertiesToAdd = new Map<string, string>();
  const baseConfig = getValueByPath(config, path) as Record<string, any>;
  for (const baseConfigKey in baseConfig) {
    propertiesToAdd.set(
      [...path, baseConfigKey].join('.'),
      baseConfig[baseConfigKey]
    );
  }

  const updatedObject = visitEachChild(
    objectNode,
    (node: Node) => {
      if (isPropertyAssignment(node)) {
        const propertyPath = [...path, node.name.getText()];
        propertiesToAdd.delete(propertyPath.join('.'));
        const value = getValueByPath(config, propertyPath);
        if (value !== undefined) {
          // false is a valid value!
          return createPropertyAssignment(context, node, value);
        }
      }
      return node;
    },
    context
  );

  if (propertiesToAdd.size === 0) {
    return updatedObject;
  }

  const extraProperties = Array.from(propertiesToAdd.entries()).map(
    ([key, value]) => {
      const prop = context.factory.createPropertyAssignment(
        key.split('.').pop(),
        context.factory.createFalse() // temp value
      );
      return createPropertyAssignment(context, prop, value);
    }
  );

  return context.factory.createObjectLiteralExpression(
    [...updatedObject.properties, ...extraProperties],
    true
  );
}

function createPropertyAssignment(
  factory: NodeFactory,
  key: string,
  value: unknown
): PropertyAssignment {
  switch (typeof value) {
    case 'number':
      return factory.createPropertyAssignment(
        factory.createIdentifier(key),
        factory.createNumericLiteral(value)
      );
    case 'string':
      return factory.createPropertyAssignment(
        factory.createIdentifier(key),
        factory.createStringLiteral(value, true)
      );
    case 'boolean':
      return factory.createPropertyAssignment(
        factory.createIdentifier(key),
        value ? factory.createTrue() : factory.createFalse()
      );

    case 'object':
      return factory.createPropertyAssignment(
        factory.createIdentifier(key),
        factory.createObjectLiteralExpression(
          Object.entries(value).map(([configKey, configValue]) => {
            return createPropertyAssignment(factory, configKey, configValue);
          }),
          true
        )
      );
  }
}

function visitRootConfigNode(
  context: TransformationContext,
  rootNode: ObjectLiteralExpression,
  newConfig: CypressConfigPt2
): ObjectLiteralExpression {
  const propertyMap = new Map<string, any>();
  for (const item in newConfig) {
    if (typeof newConfig[item] !== 'object') {
      // we only want top level properties.
      // nested properties will be handled by visitChildObjectLiteral
      propertyMap.set(item, newConfig[item]);
    }
  }

  // from the existing config, build metadata map with properties,
  // Map<string, any> =>  any => actual value or another map?
  //

  const updateAssignments = (node: Node) => {
    if (isPropertyAssignment(node)) {
      if (isObjectLiteralExpression(node.initializer)) {
        return factory.updatePropertyAssignment(
          node,
          node.name,
          updateChildObjectLiteral(
            context,
            node.initializer,
            [node.name.getText()],
            newConfig
          )
        );
      } else if (
        isNumericLiteral(node.initializer) ||
        isStringLiteralLike(node.initializer) ||
        isBooleanLiteral(node.initializer) ||
        isCallExpression(node.initializer)
      ) {
        const value = getValueByPath(newConfig, [node.name.getText()]);
        if (value) {
          propertyMap.delete(node.name.getText());
          return createPropertyAssignment(context, node, value);
        }
      }
    }
    return node;
  };

  const updatedConfig = visitEachChild(rootNode, updateAssignments, context);
  // if newConfig still have properties, then add them to the root node.

  if (propertyMap.size === 0) {
    return updatedConfig;
  }

  return context.factory.updateObjectLiteralExpression(updatedConfig, [
    ...Array.from(propertyMap.entries()).map(([key, value]) => {
      const prop = context.factory.createPropertyAssignment(
        key,
        context.factory.createFalse() // temp value
      );
      return createPropertyAssignment(context, prop, value);
    }),
    ...updatedConfig.properties,
  ]);
}
