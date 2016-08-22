/**
 * Nanocloud turns any traditional software into a cloud solution, without
 * changing or redeveloping existing source code.
 *
 * Copyright (C) 2016 Nanocloud Software
 *
 * This file is part of Nanocloud.
 *
 * Nanocloud is free software; you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * Nanocloud is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

/* global ConfigService, Machine */

const Promise = require('bluebird');
const ManualDriver = require('../drivers/manual/driver');
const AWSDriver = require('../drivers/aws/driver');
const DummyDriver = require('../drivers/dummy/driver');
const OpenstackDriver = require('../drivers/openstack/driver');

/**
 * Service responssible of the machine pool
 *
 * @class MachineService
 */

const driverNotInitializedError = new Error('Driver not initialized');
const driverAlreadyInitializedError = new Error('Driver already initialized');
const noMachineFoundError = new Error('No machine found');

const drivers = {
  manual    : ManualDriver,
  aws       : AWSDriver,
  dummy     : DummyDriver,
  openstack : OpenstackDriver
};

/**
 * The underlying driver used by the service.
 *
 * @property _driver
 * @type {Object}
 * @private
 */
let _driver = null;

/**
 * The promise returned by `initialize`. Used to prevent multiple
 * initializtions.
 *
 * @property initializing
 * @type {Promise}
 * @private
 */
let _initializing = null;

/**
 * The list of the machine beeing created.
 *
 * @property _awaitingMachines
 * @type {[]Promise[Machine]}
 * @private
 */
let _awaitingMachines = [];

/**
 * Returns a Promise that reject `err` if `condition` if false. A resolved
 * Promise otherwise.
 *
 * @method assert
 * @private
 * @param {Boolean} condition The rejection condition
 * @param {Object} err The rejected error if condition is false
 * @return {Promise[Object]}
 */
function assert(condition, err) {
  if (condition) {
    return Promise.resolve();
  } else {
    return Promise.reject(err);
  }
}

/**
 * Initialize the Iaas driver. It uses the `ConfigService` variables:
 *  - iaas: the name of the iaas driver to use
 *
 * @method initialize
 * @return {Promise}
 */
function initialize() {
  return assert(_driver === null, driverAlreadyInitializedError)
    .then(() => {
      if (_initializing) {
        return _initializing;
      }

      _initializing = ConfigService.get('iaas')
        .then((config) => {

          _driver = new (drivers[config.iaas])();

          return _driver.initialize()
            .then(() => {
              _updateMachinesPool();
              return null;
            });
        });

      return _initializing;
    });
}

/**
 * Retreive a machine for the specified user. If the user already has a machine,
 * then this machine is returned. Otherwise, if a machine is available, it is
 * affected to the user. Fails if there is no available machine.
 *
 * @method getMachineForUser
 * @param {User} The user associated to the machine
 * @return {Promise[Machine]} The user's machine
 */
function getMachineForUser(user) {
  return assert(!!_driver, driverNotInitializedError)
    .then(() => {
      return Machine.findOne({
        where: {
          user: user.id
        }
      })
        .then((res) => {
          if (!res) {
            return new Promise((resolve, reject) => {
              Machine.query({
                text: `UPDATE machine m
            SET "user" = $1::varchar
            FROM (
              SELECT machine.id
              FROM machine
              WHERE "user" IS NULL
              LIMIT 1
              FOR UPDATE SKIP LOCKED
            ) sub
            WHERE m.id = sub.id
            RETURNING *`,
                values: [user.id]
              }, (err, res) => {
                if (err) {
                  return reject(err);
                }

                if (res.rows.length) {
                  return _updateMachinesPool()
                    .then(() => {
                      return resolve(res.rows[0]);
                    });
                }

                return reject(noMachineFoundError);
              });
            });
          } else {
            return res;
          }
        });
    });
}

/**
 * Return the name of the underlying iaas driver.
 *
 * @method driverName
 * @return {String}
 */
function driverName() {
  return _driver.name();
}

/**
 * Set the user's machine endDate to now + `ConfigService:sessionDuration`
 *
 * @method increaseUsersMachineEndDate
 * @param {User} user The user to which the machine belongs
 * @return {Promise}
 */
function increaseUsersMachineEndDate(user) {
  return ConfigService.get('sessionDuration')
    .then((config) => {
      return Machine.findOne({
        user: user.id
      })
        .then((machine) => {
          return machine.setEndDate(config.sessionDuration)
            .then(() => {
              setTimeout(() => {
                _shouldTerminateMachine(machine);
              }, config.sessionDuration * 1000);
            });
        });
    });
}

/**
 * Ask the underlying driver to create a new machine. It uses the
 * `ConfigService` variable:
 *  - machinesName: the name of the machine to be created
 *
 * @method _createMachine
 * @private
 * @return {Promise}
 */
function _createMachine() {
  return ConfigService.get('machinesName')
    .then((config) => {
      const machine = _driver.createMachine({
        name: config.machinesName
      }).finally(() => {
        const len = _awaitingMachines.length;
        for (let i = 0; i < len; i++) {
          if (_awaitingMachines[i] === machine) {
            _awaitingMachines.splice(i, 1);
          }
        }
      });

      _awaitingMachines.push(machine);
      return machine;
    });
}

function _terminateMachine(machine) {
  return Machine.destroy({
    id: machine.id
  })
    .then(() => {
      return _driver.destroyMachine(machine);
    });
}

/**
 * Create new machines if needed in the pool. It uses the `ConfigService`
 * variable:
 *  - machinePoolSize: the number of available machine to keep in the pool
 *
 * @method _updateMachinesPool
 * @private
 * @return {Promise}
 */
function _updateMachinesPool() {
  return assert(!!_driver, driverNotInitializedError)
    .then(() => {
      return ConfigService.get('machinePoolSize')
        .then((config) => {
          return Machine.count({
            where: {
              user: null
            }
          })
            .then((machineNbr) => {
              let i = (config.machinePoolSize + _awaitingMachines.length) - machineNbr;
              let machines = [];
              while (i > 0) {
                machines.push(_createMachine());
                i--;
              }

              return Promise.all(machines);
            });
        });
    });
}

/**
 * Check if the specified machine should be terminated and terminate it if so.
 * The machine will be terminated if the machine's endDate is in the past and if
 * the user doesn't use it.
 *
 * @method _shouldTerminateMachine
 * @private
 * @return {null}
 */
function _shouldTerminateMachine(machine) {
  machine.isSessionActive()
    .then((isActive) => {
      if (!isActive) {
        const now = new Date();
        if (machine.endDate < now) {
          _terminateMachine(machine);
        }
      }
    });
  return null;
}

/**
 * Inform the broker that the user has open a session on his machine.
 * It basically just call `increaseUsersMachineEndDate`.
 *
 * @method sessionOpen
 * @param {User} user The user that open the session
 * @return {Promise}
 */
function sessionOpen(user) {
  return increaseUsersMachineEndDate(user);
}

/**
 * Inform the broker that the user's session has ended.
 * It basically just call `increaseUsersMachineEndDate`.
 *
 * @method sessionEnded
 * @param {User} user The user that ended the session
 * @return {Promise}
 */
function sessionEnded(user) {
  return increaseUsersMachineEndDate(user);
}

/**
 * Return the list of machines with the status attribute up to date.
 *
 * @method machines
 * @return {Promise[[]Object]}
 */
function machines() {
  return Machine.find({
    type: _driver.name()
  })
    .then((machines) => {
      machines = machines.map((machine) => {
        machine = machine.toObject();
        return _driver.getServer(machine.id)
          .then((server) => {
            machine.status = server.status;
            return machine;
          });
      });
      return Promise.all(machines);
    });
}

module.exports = {
  initialize, getMachineForUser, driverName, sessionOpen, sessionEnded,
  machines
};