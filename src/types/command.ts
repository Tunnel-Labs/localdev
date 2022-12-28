import type { Command } from 'commander'

export interface LocaldevCommandSpec {
	command: Command
	hidden: boolean
}
