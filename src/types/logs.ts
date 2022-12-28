export interface UnwrappedLogLineData {
	text: string
	/**
		We store the timestamp of the log and not just the relative order so that we can determine the order in which to display two logs which came from two different services.
	*/
	timestamp: number
}

export interface WrappedLogLineData {
	text: string
	timestamp: number

	// For two parts of the same unwrapped log line
	wrappedLineIndex: number
}
