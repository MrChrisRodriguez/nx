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
  SourceFile,
  TransformationContext,
  visitEachChild,
  visitNode,
  Visitor,
} from 'typescript';
import { isBooleanLiteral } from '@nrwl/cypress/src/utils/config/transformer.helper';

export function removeProps(propertyPaths: string[]) {
  return (context: TransformationContext) => {
    return (sourceFile: SourceFile) => {
      const visitor: Visitor = (node: Node): Node => {
        // walk though each property assignment and see if they match the propertyPaths to remove.

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
              [visitRootConfig(context, rootConfigNode, propertyPaths)]
              // TODO(caleb: write visitor to remove properties that match the propertyPaths
            )
          );
        }
        return visitEachChild(node, visitor, context);
      };
      return visitNode(sourceFile, visitor);
    };
  };
}

function visitRootConfig(
  context: TransformationContext,
  rootNode: ObjectLiteralExpression,
  propertyPaths: string[]
): ObjectLiteralExpression {
  const remover: Visitor = (node: Node): Node => {
    if (isPropertyAssignment(node)) {
      if (isObjectLiteralExpression(node.initializer)) {
        return visitEachChild(node, remover, context);
      } else if (
        isNumericLiteral(node.initializer) ||
        isStringLiteralLike(node.initializer) ||
        isBooleanLiteral(node.initializer) ||
        isCallExpression(node.initializer)
      ) {
        // if the property path is in the propertyPaths array, remove it.
        if (propertyPaths.includes(node.name.getText())) {
          return undefined;
        }
        return node;
      }
    }
  };
  return visitEachChild(rootNode, remover, context);
}
