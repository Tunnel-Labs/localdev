import { getLocaldevConfig } from '@dialect-inc/localdev-config'
import inquirer from 'inquirer'
import InquirerAutocompletePrompt from 'inquirer-autocomplete-prompt'

import { getDevServiceName } from '~/utils/service/name.js'

export async function promptDevServiceId(): Promise<string> {
	inquirer.registerPrompt('autocomplete', InquirerAutocompletePrompt)
	const localdevConfig = await getLocaldevConfig()
	const { devServiceId } = await inquirer.prompt<{ devServiceId: string }>({
		message: 'Dev command to log',
		// @ts-expect-error: bad typings
		type: 'autocomplete',
		searchable: true,
		name: 'devServiceId',
		source: (_answersSoFar: string[], input: string | undefined) =>
			localdevConfig.devServiceSpecs
				.filter((devServiceSpec) =>
					getDevServiceName({ devServiceSpec }).includes(input ?? '')
				)
				.map((devServiceSpec) => ({
					name: `${getDevServiceName({ devServiceSpec })} (${
						devServiceSpec.id
					})`,
					value: devServiceSpec.id
				}))
	})

	return devServiceId
}
