import fs from 'node:fs'
import path from 'node:path'

import onetime from 'onetime'

import { cli } from '~/utils/cli.js'
import { localdevState } from '~/utils/state.js'

export const getMkcertCertsDir = onetime(async () => {
	const mkcertCertsDir = path.join(localdevState.localdevFolder, 'mkcert')

	await fs.promises.mkdir(mkcertCertsDir, { recursive: true })

	return mkcertCertsDir
})

export const getMkcertCertsPaths = onetime(async () => {
	const { stdout: caRootDir } = await cli.mkcert('-CAROOT')
	const mkcertCertsDir = await getMkcertCertsDir()

	return {
		caFilePath: path.join(caRootDir, 'rootCA.pem'),
		keyFilePath: path.join(mkcertCertsDir, 'test-key.pem'),
		certFilePath: path.join(mkcertCertsDir, 'test-cert.pem'),
	}
})

/**
	A utility function to creates locally-trusted development certificates using mkcert

	@param localDomains - A list of local domains to create certificates for (these domains should end in `.test`)

	@see https://github.com/FiloSottile/mkcert
*/
export async function createMkcertCerts({
	localDomains,
}: {
	localDomains: string[]
}) {
	const keyFileName = 'test-key.pem'
	const certFileName = 'test-cert.pem'
	const mkcertCertsDir = await getMkcertCertsDir()

	await cli.mkcert('-install')
	await cli.mkcert(
		['-key-file', keyFileName, '-cert-file', certFileName, ...localDomains],
		{ cwd: mkcertCertsDir }
	)

	const { caFilePath, keyFilePath, certFilePath } = await getMkcertCertsPaths()
	const [key, cert, ca] = await Promise.all([
		fs.promises.readFile(keyFilePath, 'utf8'),
		fs.promises.readFile(certFilePath, 'utf8'),
		fs.promises.readFile(caFilePath, 'utf8'),
	])

	return {
		ca,
		key,
		cert,
	}
}
