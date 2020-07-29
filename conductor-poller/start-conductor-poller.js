import {registerTaskDef, registerHttpWorker} from './conductor-polling';
import {createLogger, config} from '../shared/utils';

const logger = createLogger('conductor-starter', config.OVERALL_LOG_LEVEL);

async function main() {
    logger.info(`Registering http taskdef URL ${config.CONDUCTOR_URL}`)
    await registerTaskDef();
    logger.info('Starting polling')
    await registerHttpWorker();
}

async function mainWithRetry() {
    // --unhandled-rejections=strict is enabled, so connection issues
    // should restart this container.
    // However because of nodemon we restart in a loop here.
    // This happens during development when conductor is not ready yet.
    try {
        await main();
    } catch (error) {
        console.error('Got error, retrying in 1s', {error});
        setTimeout(mainWithRetry, 1000);
    }
}

mainWithRetry();
