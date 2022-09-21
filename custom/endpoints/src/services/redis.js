import { createClient } from '@redis/client';

const redisClient = createClient({
    url: 'redis://:qxuhIRCoK6V63dHVmg2@bhfnv0d1ducyuclwbstb-redis.services.clever-cloud.com:3342'
    // url: process.env.REDIS_CLUB
})

redisClient.on('connect', () => { });
redisClient.on('ready', () => { });
redisClient.on('end', () => { });
redisClient.on('error', (err) => { console.log(err) });
redisClient.on('reconnecting', () => { });

export default redisClient
