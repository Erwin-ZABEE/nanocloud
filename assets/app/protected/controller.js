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
 * You should have received a copy of the GNU Affero General
 * Public License
 * along with this program.  If not, see
 * <http://www.gnu.org/licenses/>.
 */

import Ember from 'ember';
import config from 'nanocloud/config/environment';

export default Ember.Controller.extend({
  applicationController: Ember.inject.controller('application'),
  routeName: Ember.computed.alias('applicationController.currentRouteName'),
  connectionName: null,

  session: Ember.inject.service('session'),
  name: config.APP.name,
  version: config.APP.version,

  showSidebar: false,

  documentationUrl: 'http://documentation.nanocloud.com/docs/',
  routeNameToDocumentationLink: {
    'protected.dashboard' : 'dashboard',
    'protected.machines.index' : 'overview-of-the-machines-tab',
    'protected.machines.machine' : 'access-the-information-of-the-machine',
    'protected.histories.index' : 'overview-of-the-history-tab',
    'protected.apps.index' : 'overview-of-the-applications-tab',
    'protected.apps.app' : 'rename-an-application',
    'protected.files.index' : 'overview-of-the-files-tab',
    'protected.users.index' : 'overview-of-the-users-tab',
    'protected.users.new' : 'create-a-new-user',
    'protected.users.user' : 'modify-the-users-information',
    'protected.users.groups.index' : 'overview-of-the-users-tab#groups',
    'protected.users.groups.new' : 'create-a-new-group',
    'protected.users.groups.group.members' : 'add-remove-a-group-member',
    'protected.users.groups.group.apps' : 'add-remove-an-application',
    'protected.users.groups.group.index' : 'rename-a-group',
    'protected.configs.index' : 'configure-sessions',
    'protected.configs.user-right' : 'configure-user-rights',
    'protected.configs.email-configuration' : 'configure-emails',
    'protected.configs.other-setting' : 'other-settings',
  },

  redirectLink: Ember.computed('routeName', function() {
    return this.get('documentationUrl') + this.get('routeNameToDocumentationLink')[this.get('routeName')];
  }),

  actions: {
    toggleSidebar() {
      this.toggleProperty('showSidebar');
    },

    logout() {
      this.get('session').invalidate();
    },
  }
});