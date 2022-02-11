---
title: '@nrwl/cypress:cypress-component-project generator'
description: 'Set up Cypress Component Test for a project'
---

# @nrwl/cypress:cypress-component-project

Set up Cypress Component Test for a project

## Usage

```bash
nx generate cypress-component-project ...
```

```bash
nx g cy-cmp ... # same
```

By default, Nx will search for `cypress-component-project` in the default collection provisioned in `workspace.json`.

You can specify the collection explicitly as follows:

```bash
nx g @nrwl/cypress:cypress-component-project ...
```

Show what will be generated without writing to disk:

```bash
nx g cypress-component-project ... --dry-run
```

### Examples

Add cypress component testing to an existing project named my-cool-lib:

```bash
nx g @nrwl/cypress:cypress-component-project --project=my-cool-lib --componentType=react
```

Add Cypress component testing to an existing project that already has a Cypress component testing enabled. Helpful to reset the configuration to the default.:

```bash
nx g @nrwl/cypress:cypress-component-project --project=my-cool-lib --componentType=react --force
```

## Options

### componentType (_**required**_)

Alias(es): framework

Type: `string`

Possible values: `react`, `next`

Which framework is being used?

### project (_**required**_)

Type: `string`

The name of the project to convert

### compiler

Default: `babel`

Type: `string`

Possible values: `swc`, `babel`

Which compiler is being used in the existing project?

### force

Default: `false`

Type: `boolean`

Overwrite an existing cypress component test project. This is helpful if you want to reset to the default configurations.
