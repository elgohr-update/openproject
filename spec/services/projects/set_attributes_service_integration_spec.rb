#-- copyright
# OpenProject is an open source project management software.
# Copyright (C) 2012-2021 the OpenProject GmbH
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License version 3.
#
# OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
# Copyright (C) 2006-2013 Jean-Philippe Lang
# Copyright (C) 2010-2013 the ChiliProject Team
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation; either version 2
# of the License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program; if not, write to the Free Software
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
#
# See docs/COPYRIGHT.rdoc for more details.
#++

require 'spec_helper'

describe Projects::SetAttributesService, 'integration', type: :model do
  let(:user) do
    FactoryBot.create(:user, global_permissions: %w[add_project])
  end
  let(:contract) { Projects::CreateContract }
  let(:instance) { described_class.new(user: user, model: project, contract_class: contract) }
  let(:attributes) { {} }
  let(:project) { Project.new }
  let(:service_result) do
    instance.call(attributes)
  end

  describe 'with a project name starting with numbers' do
    let(:attributes) { { name: '100 Project A' } }

    it 'will create an identifier with the numbers stripped' do
      expect(service_result).to be_success
      expect(service_result.result.identifier).to eq 'project-a'
    end
  end

  describe 'with an existing project' do
    let(:existing_identifier) { 'my-new-project' }
    let!(:existing) { FactoryBot.create :project, identifier: existing_identifier }

    context 'and a new project with no identifier set' do
      let(:project) { Project.new name: 'My new project' }

      it 'will auto-correct the identifier' do
        expect(service_result).to be_success
        expect(service_result.result.identifier).to eq 'my-new-project-1'
      end
    end

    context 'and a new project with the same identifier set' do
      let(:project) { Project.new name: 'My new project', identifier: 'my-new-project' }

      it 'will result in an error' do
        expect(service_result).not_to be_success
        expect(service_result.result.identifier).to eq 'my-new-project'

        errors = service_result.errors.full_messages
        expect(errors).to eq ['Identifier has already been taken.']
      end
    end

    context 'with an existing identifier and a project name starting with numbers' do
      let(:attributes) { { name: '100 My new project' } }

      it 'will auto correct the identifier with the numbers stripped' do
        expect(service_result).to be_success
        expect(service_result.result.identifier).to eq 'my-new-project-1'
      end
    end
  end
end
