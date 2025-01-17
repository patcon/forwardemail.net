// eslint-disable-next-line import/no-unassigned-import
require('#config/env');

const process = require('process');
const os = require('os');
const { parentPort } = require('worker_threads');

const Graceful = require('@ladjs/graceful');
const Mongoose = require('@ladjs/mongoose');
const pMap = require('p-map');
const sharedConfig = require('@ladjs/shared-config');

const Payments = require('#models/payment');
const logger = require('#helpers/logger');

const concurrency = os.cpus().length;
const breeSharedConfig = sharedConfig('BREE');
const mongoose = new Mongoose({ ...breeSharedConfig.mongoose, logger });
const graceful = new Graceful({
  mongooses: [mongoose],
  logger
});

graceful.listen();

(async () => {
  await mongoose.connect();

  const $or = [];
  const props = [];

  for (const prop of Object.keys(Payments.prototype.schema.paths)) {
    if (Payments.prototype.schema.paths[prop].instance === 'String') {
      $or.push({
        [prop]: { $type: 10 }
      });
      props.push(prop);
    }
  }

  const count = await Payments.countDocuments({ $or });
  console.log('count', count);

  const ids = await Payments.distinct('_id', { $or });

  async function mapper(id) {
    const payment = await Payments.findById(id);
    if (!payment) throw new Error('payment does not exist');
    for (const prop of props) {
      if (payment[prop] === null) {
        console.log(`payment ${payment.id} had null prop of ${prop}`);
        payment[prop] = undefined;
      }
    }

    await payment.save();
  }

  await pMap(ids, mapper, { concurrency });

  if (parentPort) parentPort.postMessage('done');
  else process.exit(0);
})();
