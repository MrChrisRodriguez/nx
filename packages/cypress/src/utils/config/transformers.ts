import {
  CallExpression,
  isCallExpression,
  isExportAssignment,
  isNumericLiteral,
  isObjectLiteralExpression,
  isPropertyAssignment,
  isStringLiteralLike,
  Node,
  ObjectLiteralExpression,
  PropertyAssignment,
  SourceFile,
  SyntaxKind,
  TransformationContext,
  TransformerFactory,
  visitEachChild,
  visitNode,
  Visitor,
} from 'typescript';
import { defineConfig } from 'cypress';

export type CypressConfig = Parameters<typeof defineConfig>[0];

export function mergeCypressConfigs(
  newConfig: CypressConfig,
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
                ? []
                : [visitRootConfigNode(context, rootConfigNode, newConfig)] // TODO(caleb): update this node;
            )
          );
        }

        return visitEachChild(node, visitor, context);
      };

      return visitNode(sourceFile, visitor);
    };
  };
}

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

function getValueByPath(config: CypressConfig, path: string[]): unknown {
  return path.reduce((acc, key) => {
    return acc?.[key];
  }, config);
}

function updateChildObjectLiteral(
  context: TransformationContext,
  objectNode: ObjectLiteralExpression,
  path: string[],
  config: CypressConfig
): ObjectLiteralExpression {
  // TODO(caleb): get all properties from the object and mark them as updated or not updated. and at the end make sure to update all properties that haven't been updated yet. because they need to be added
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
        console.log(value, path);
        if (value !== undefined) {
          // false is a valid value!
          return updatePropertyAssignment(context, node, value);
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
      return updatePropertyAssignment(context, prop, value);
    }
  );

  return context.factory.createObjectLiteralExpression(
    [...updatedObject.properties, ...extraProperties],
    true
  );
}

function updatePropertyAssignment(
  context: TransformationContext,
  property: PropertyAssignment,
  value: unknown
): PropertyAssignment {
  switch (typeof value) {
    case 'number':
      return context.factory.createPropertyAssignment(
        property.name,
        context.factory.createNumericLiteral(value)
      );
    case 'string':
      return context.factory.createPropertyAssignment(
        property.name,
        context.factory.createStringLiteral(value, true)
      );
    case 'boolean':
      return context.factory.createPropertyAssignment(
        property.name,
        value ? context.factory.createTrue() : context.factory.createFalse()
      );
    case 'function':
      return context.factory.createPropertyAssignment(
        property.name,
        createExpressionFromFunction(context, value)
      );
  }
}

function visitRootConfigNode(
  context: TransformationContext,
  rootNode: ObjectLiteralExpression,
  newConfig: CypressConfig
): ObjectLiteralExpression {
  const propertyMap = new Map<string, any>();
  for (const item in newConfig) {
    if (typeof newConfig[item] !== 'object') {
      propertyMap.set(item, newConfig[item]);
    }
  }

  const updateAssignments = (node: Node) => {
    if (isPropertyAssignment(node)) {
      if (isObjectLiteralExpression(node.initializer)) {
        return context.factory.updatePropertyAssignment(
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
          return updatePropertyAssignment(context, node, value);
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
      return updatePropertyAssignment(context, prop, value);
    }),
    ...updatedConfig.properties,
  ]);
}

function isBooleanLiteral(node: Node) {
  console.log(
    node.kind === SyntaxKind.TrueKeyword ||
      node.kind === SyntaxKind.FalseKeyword,
    node.getText()
  );
  return (
    node.kind === SyntaxKind.TrueKeyword ||
    node.kind === SyntaxKind.FalseKeyword
  );
}
