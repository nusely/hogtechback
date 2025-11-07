import fs from 'fs';
import path from 'path';

const TEMPLATE_SEARCH_PATHS = [
  // Project root when running via `node dist/index.js`
  (filename: string) => path.join(process.cwd(), 'email-templates', filename),
  // Monorepo root when backend is nested (e.g. ../email-templates)
  (filename: string) => path.join(process.cwd(), '..', 'email-templates', filename),
  // Relative to compiled JavaScript in dist/utils
  (filename: string) => path.join(__dirname, '../email-templates', filename),
  (filename: string) => path.join(__dirname, '../../email-templates', filename),
  (filename: string) => path.join(__dirname, '../../../email-templates', filename),
];

export const resolveTemplatePath = (filename: string): string => {
  for (const buildPath of TEMPLATE_SEARCH_PATHS) {
    const candidate = buildPath(filename);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const searched = TEMPLATE_SEARCH_PATHS.map((fn) => fn(filename)).join(', ');
  throw new Error(`Email template "${filename}" not found. Checked: ${searched}`);
};


