import {registerTaskDef, registerHttpWorker} from './conductor-polling';
import {createLogger, config} from '../shared/utils';

const logger = createLogger('conductor-starter', config.OVERALL_LOG_LEVEL);

async function main() {
    logger.info(`Registering http taskdef URL ${config.CONDUCTOR_URL}`)
    await registerTaskDef();
    logger.info('Starting polling')
    await registerHttpWorker();
}

main();
