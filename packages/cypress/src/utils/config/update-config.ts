import {
  createPrinter,
  createSourceFile,
  ScriptTarget,
  transform,
} from 'typescript';
import {
  CypressConfigPt2,
  mergeCypressConfigs,
} from './add-update-property-transformer';

// TODO(caleb): handle devserver in config
export function addOrUpdateConfigProperties(
  configContent: string,
  config: CypressConfigPt2,
  overwrite: boolean = false
) {
  const sourceFile = createSourceFile(
    'cypress.config.ts',
    configContent,
    ScriptTarget.Latest,
    true
  );

  const transformedResult = transform(sourceFile, [
    mergeCypressConfigs(config, overwrite),
  ]);

  return createPrinter().printFile(transformedResult.transformed[0]);
}

export function removeConfigProperties() {}

// export function addConfigImport() {}
//
// export function removeConfigImport() {}
