import { Text, useInput } from 'ink';
import React from 'react';

import { Service } from '../utils/service.js';
import { localdevState, useLocaldevSnapshot } from '../utils/state.js';

/**
	The logs pane just informs the user that logs are being streamed (the logs themselves aren't displayed in the logs pane, but rather in the logs box)
*/
export function HijackPane() {
	const { hijackedServiceId } = useLocaldevSnapshot();

	// The logs pane should not be displayed if `logsBoxServiceId` is null
	if (hijackedServiceId === null) {
		return null;
	}

	useInput((_input, key) => {
		if (key.shift && key.escape) {
			localdevState.hijackedServiceId = null;
		}
	});

	return (
		<Text>
			Hijacking service {Service.get(hijackedServiceId).name}{' '}
			(press Shift+Escape to stop hijacking)
		</Text>
	);
}
