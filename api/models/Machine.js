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
 */

/* global Machine */

const url = require('url');
const Promise = require('bluebird');
const request = Promise.promisifyAll(require('request'));
const uuid = require('node-uuid');

/**
 * @module models
 * @class Machine
 */
module.exports = {

  autoPK: false,
  attributes: {
    id: {
      type: 'string',
      primaryKey: true,
      defaultsTo: function (){ return uuid.v4(); }
    },
    name: {
      type: 'string'
    },
    type: {
      type: 'string'
    },
    ip: {
      type: 'string'
    },
    username: {
      type: 'string'
    },
    password: {
      type: 'string'
    },
    domain: {
      type: 'string'
    },
    endDate: {
      type: 'datetime'
    },
    plazaport: {
      type: 'integer'
    },
    user: {
      model: 'user',
      unique: true
    },

    setEndDate(duration) {
      let now = (new Date()).getTime();
      let endDate = new Date(now + duration * 1000);

      return Machine.update({
        id: this.id
      }, {
        endDate: endDate
      });
    },

    /*
     * Get informations about sessions on this machines
     *
     * @method getSessions
     * @return {Promise[Array]} a promise resolving to an array of session
     */
    getSessions() {

      let plazaAddr = url.format({
        protocol: 'http',
        hostname: this.ip,
        port: this.plazaport,
        pathname: '/sessions/' + this.username
      });

      return request.getAsync(plazaAddr)
        .then((res) => {
          let body = res.body;

          try {
            body = JSON.parse(body);
          } catch (err) {
            return Promise.reject(err);
          }

          let sessions = [];
          body.data.forEach((session) => {
            sessions.push({
              id: uuid.v4(), // id does not matter for session but is required for JSON API
              username: session[1],
              state: session[3],
              userId: this.user
            });
          });

          return sessions;
        });
    },

    isSessionActive() {

      return this.getSessions()
        .then((sessions) => {
          if (sessions.length) {
            const status = sessions[0].state;

            if (status === 'Active') {
              return true;
            }
          }
          return false;
        });
    }
  }
};
