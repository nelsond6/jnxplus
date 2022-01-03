import {
  addProjectConfiguration,
  formatFiles,
  generateFiles,
  getWorkspaceLayout,
  names,
  offsetFromRoot,
  Tree,
} from '@nrwl/devkit';
import { appRootPath } from '@nrwl/tao/src/utils/app-root';
import * as path from 'path';
import { XmlDocument } from 'xmldoc';
import { LinterType } from '../../utils/types';
import { readXml, readXml2 } from '../../utils/xml';
import { NxBootMavenAppGeneratorSchema } from './schema';

interface NormalizedSchema extends NxBootMavenAppGeneratorSchema {
  projectName: string;
  projectRoot: string;
  projectDirectory: string;
  parsedTags: string[];
  appClassName: string;
  packageName: string;
  packageDirectory: string;
  linter: LinterType;
  parentGroupId: string;
  parentProjectName: string;
  parentProjectVersion: string;
  relativePath: string;
}

function normalizeOptions(
  tree: Tree,
  options: NxBootMavenAppGeneratorSchema
): NormalizedSchema {
  const projectName = names(options.name).fileName;
  const projectDirectory = options.directory
    ? `${names(options.directory).fileName}/${projectName}`
    : projectName;
  const projectRoot = `${getWorkspaceLayout(tree).appsDir}/${projectDirectory}`;
  const parsedTags = options.tags
    ? options.tags.split(',').map((s) => s.trim())
    : [];

  const appClassName = `${names(options.name).className}Application`;
  const packageName = `${options.groupId}.${names(
    options.name
  ).className.toLocaleLowerCase()}`;
  const packageDirectory = `${options.groupId.replace(
    new RegExp(/\./, 'g'),
    '/'
  )}/${names(options.name).className.toLocaleLowerCase()}`;

  const linter = options.language === 'java' ? 'checkstyle' : 'ktlint';

  let workspacePath = '';
  if (process.env.NODE_ENV === 'e2e') {
    workspacePath = path.join(appRootPath, 'tmp', 'nx-e2e', 'proj');
  } else {
    workspacePath = appRootPath;
  }

  const relativePath = path
    .relative(projectDirectory, workspacePath)
    .replace(new RegExp(/\\/, 'g'), '/');

  const pomXmlPath = path.join(workspacePath, 'pom.xml');
  const pomXmlContent = readXml2(pomXmlPath);
  const parentGroupId = pomXmlContent.childNamed('groupId').val;
  const parentProjectName = pomXmlContent.childNamed('artifactId').val;
  const parentProjectVersion = pomXmlContent.childNamed('version').val;

  return {
    ...options,
    projectName,
    projectRoot,
    projectDirectory,
    parsedTags,
    appClassName,
    packageName,
    packageDirectory,
    linter,
    parentGroupId,
    parentProjectName,
    parentProjectVersion,
    relativePath,
  };
}

function addFiles(tree: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
    ...names(options.name),
    offsetFromRoot: offsetFromRoot(options.projectRoot),
    template: '',
  };
  generateFiles(
    tree,
    path.join(__dirname, 'files', options.language),
    options.projectRoot,
    templateOptions
  );
}

export default async function (
  tree: Tree,
  options: NxBootMavenAppGeneratorSchema
) {
  const normalizedOptions = normalizeOptions(tree, options);
  addProjectConfiguration(tree, normalizedOptions.projectName, {
    root: normalizedOptions.projectRoot,
    projectType: 'application',
    sourceRoot: `${normalizedOptions.projectRoot}/src`,
    targets: {
      build: {
        executor: '@jnxplus/nx-boot-maven:build',
      },
      serve: {
        executor: '@jnxplus/nx-boot-maven:serve',
      },
      lint: {
        executor: '@jnxplus/nx-boot-maven:lint',
        options: {
          linter: `${normalizedOptions.linter}`,
        },
      },
      test: {
        executor: '@jnxplus/nx-boot-maven:test',
      },
    },
    tags: normalizedOptions.parsedTags,
  });
  addFiles(tree, normalizedOptions);
  addProjectToParentPomXml(tree, normalizedOptions);
  await formatFiles(tree);
}

function addProjectToParentPomXml(tree: Tree, options: NormalizedSchema) {
  const filePath = `pom.xml`;
  const xmldoc = readXml(tree, filePath);
  const fragment = new XmlDocument(`
  <module>${options.projectRoot}</module>
`);
  xmldoc.childNamed('modules').children.push(fragment);
  tree.write(filePath, xmldoc.toString());
}
