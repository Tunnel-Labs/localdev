export interface UnwrappedLogLineData {
	/**
		A unique identifier for the log line
	*/
	id: string;

	text: string;

	/**
		We store the timestamp of the log and not just the relative order so that we can determine the order in which to display two logs which came from two different services.
	*/
	timestamp: number;
}

export interface WrappedLogLineData {
	/**
		The unique ID of the wrapped line (@@unique[wrappedLineIndex, unwrappedLineId])
	*/
	unwrappedLineId: string;
	text: string;
	timestamp: number;

	// For two parts of the same unwrapped log line
	wrappedLineIndex: number;
}
