import { fakeAsync } from '@angular/core/testing';
import {
  createDynamicInputFixture,
  testDynamicInputControValueAccessor,
} from "core-app/modules/common/dynamic-forms/spec/helpers";

describe('IntegerInputComponent', () => {
  it('should load the field', fakeAsync(() => {
    const fieldsConfig = [
      {
        "type": "integerInput" as "integerInput",
        "key": "testControl",
        "templateOptions": {
          "required": true,
          "label": "testControl",
        },
      }
    ];
    const formModel = {
      testControl: 'testValue',
    };
    const testModel = {
      initialValue: formModel.testControl,
      changedValue: 'testValue2',
    };

    const fixture = createDynamicInputFixture(fieldsConfig, formModel);

    testDynamicInputControValueAccessor(fixture, testModel, 'op-integer-input input');
  }));
});

