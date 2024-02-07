import fs from 'node:fs';
import path from 'pathe';
import { defineBuildConfig } from 'unbuild';

const sourceDirnames = [
	'bin',
	'command-panes',
	'exports',
	'types',
	'utils',
];

export default defineBuildConfig({
	entries: [
		...sourceDirnames.flatMap((dirname) => [
			{
				builder: 'mkdist' as const,
				format: 'mjs',
				input: dirname,
				outDir: path.join('.build', 'mjs', dirname),
				declaration: true,
				ext: '.js',
			},
			{
				builder: 'mkdist' as const,
				format: 'cjs',
				input: dirname,
				outDir: path.join('.build', 'cjs', dirname),
				declaration: true,
				ext: '.js',
			},
		]),
	],
	hooks: {
		async 'mkdist:done'(ctx) {
			await fs.promises.writeFile(
				'.build/cjs/package.json',
				'{ "type": "commonjs" }',
			);
		},
	},
});
