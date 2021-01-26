// @flow

import { APP_WILL_MOUNT, APP_WILL_UNMOUNT } from '../../base/app';
import { MiddlewareRegistry } from '../../base/redux';

import { clientResized } from './actions';

/**
 * Dimensions change handler.
 */
let handler;

/**
 * Middleware that handles window dimension changes.
 *
 * @param {Store} store - The redux store.
 * @returns {Function}
 */
MiddlewareRegistry.register(store => next => action => {
    const result = next(action);

    switch (action.type) {
    case APP_WILL_UNMOUNT: {
        _appWillUnmount();
        break;
    }
    case APP_WILL_MOUNT:
        _appWillMount(store);
        break;

    }

    return result;
});

/**
 * Notifies this feature that the action {@link APP_WILL_MOUNT} is being
 * dispatched within a specific redux {@code store}.
 *
 * @param {Store} store - The redux store in which the specified {@code action}
 * is being dispatched.
 * @private
 * @returns {void}
 */
function _appWillMount(store) {
    handler = () => {
        // const {
        //     innerHeight,
        //     innerWidth
        // } = window;

        let w = $('#largeVideoContainer').width();
        let h = $('#largeVideoContainer').height();
        store.dispatch(clientResized(w, h));
    };
    window.addEventListener('resize', handler);
    window.addEventListener('forceResize', handler);
}

/**
 * Notifies this feature that the action {@link APP_WILL_UNMOUNT} is being
 * dispatched within a specific redux {@code store}.
 *
 * @private
 * @returns {void}
 */
function _appWillUnmount() {
    window.removeEventListener('resize', handler);

    handler = undefined;
}
