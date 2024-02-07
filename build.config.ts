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
		{
			input: 'exports/main.ts',
			name: 'main',
		},
		...sourceDirnames.flatMap((dirname) => [
			{
				builder: 'mkdist' as const,
				format: 'mjs',
				input: dirname,
				outDir: path.join('.build', dirname),
				declaration: true,
			},
			{
				builder: 'mkdist' as const,
				format: 'cjs',
				input: dirname,
				outDir: path.join('.build', dirname),
				declaration: false,
			},
		]),
	],
	outDir: '.build',
	rollup: {
		emitCJS: true,
		inlineDependencies: true,
	},
	declaration: true,
});
