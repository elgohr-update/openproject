import { TestBed } from '@angular/core/testing';
import { DynamicFormService } from "core-app/modules/common/dynamic-forms/services/dynamic-form/dynamic-form.service";
import { HttpClientTestingModule, HttpTestingController } from "@angular/common/http/testing";
import { HttpClient } from "@angular/common/http";
import { DynamicFieldsService } from "core-app/modules/common/dynamic-forms/services/dynamic-fields/dynamic-fields.service";
import { FormGroup } from "@angular/forms";
import { of } from "rxjs";
import { FormsService } from "core-app/core/services/forms/forms.service";

describe('DynamicFormService', () => {
  let httpClient:HttpClient;
  let httpTestingController:HttpTestingController;
  let dynamicFormService:DynamicFormService;
  let formsService:jasmine.SpyObj<FormsService>;
  const testFormUrl = 'http://op.com/form';
  const formSchema = {
    "_type": "Form",
    "_embedded": {
      "payload": {
        "name": "Project 1",
        "_links": {
          "parent": {
            "href": "/api/v3/projects/26",
            "title": "Parent project"
          }
        }
      },
      "schema": {
        "_type": "Schema",
        "_dependencies": [],
        "name": {
          "type": "String",
          "name": "Name",
          "required": true,
          "hasDefault": false,
          "writable": true,
          "minLength": 1,
          "maxLength": 255,
          "options": {}
        },
        "parent": {
          "type": "Project",
          "name": "Subproject of",
          "required": false,
          "hasDefault": false,
          "writable": true,
          "_links": {
            "allowedValues": {
              "href": "/api/v3/projects/available_parent_projects?of=25"
            }
          }
        },
        "_links": {}
      },
      "validationErrors": {}
    },
    "_links": {
      "self": {
        "href": "/api/v3/projects/25/form",
        "method": "post"
      },
      "validate": {
        "href": "/api/v3/projects/25/form",
        "method": "post"
      },
      "commit": {
        "href": "/api/v3/projects/25",
        "method": "patch"
      }
    }
  };
  const dynamicFormConfig = {
    "fields": [
      {
        "type": "textInput",
        "key": "name",
        "templateOptions": {
          "required": true,
          "label": "Name",
          "type": "text"
        }
      },
      {
        "type": "selectInput",
        "expressionProperties": {},
        "key": "_links.parent",
        "templateOptions": {
          "required": false,
          "label": "Subproject of",
          "type": "number",
          "locale": "en",
          "bindLabel": "title",
          "searchable": false,
          "virtualScroll": true,
          "typeahead": false,
          "clearOnBackspace": false,
          "clearSearchOnAdd": false,
          "hideSelected": false,
          "text": {
            "add_new_action": "Create"
          },
          "options": of([]),
        }
      }
    ],
    "model": {
      "name": "Project 1",
      "_links": {
        "parent": {
          "href": "/api/v3/projects/26",
          "title": "Parent project",
          "name": "Parent project"
        }
      },
      "_meta": undefined
    },
    "form": new FormGroup({}),
  };

  beforeEach(() => {
    const formServiceSpy = jasmine.createSpyObj('FormsService', ['submit$']);

    TestBed.configureTestingModule({
      imports: [
        HttpClientTestingModule,
      ],
      providers: [
        DynamicFormService,
        DynamicFieldsService,
        { provide: FormsService, useValue: formServiceSpy }
      ]
    });
    httpClient = TestBed.inject(HttpClient);
    httpTestingController = TestBed.inject(HttpTestingController);
    dynamicFormService = TestBed.inject(DynamicFormService);
    formsService = TestBed.inject(FormsService) as jasmine.SpyObj<FormsService>;
  });

  it('should be created', () => {
    expect(dynamicFormService).toBeTruthy();
  });

  it('should return the dynamic form config from the backend response', () => {
    dynamicFormService
      .getSettingsFromBackend$(testFormUrl)
      .subscribe(dynamicFormConfigResponse => {
        expect(dynamicFormConfigResponse.fields.length).toEqual(dynamicFormConfig.fields.length, 'should return one dynamic field per schema field');
        expect(
          dynamicFormConfigResponse.fields.every((field, index) => field.type === dynamicFormConfig.fields[index].type)
        )
          .toBe(true, 'should return the dynamic fields in the schema order');
        expect(dynamicFormConfigResponse.model).toEqual(dynamicFormConfig.model, 'should return the form model formatted');
      });

    const req = httpTestingController.expectOne(testFormUrl);

    expect(req.request.method).toEqual('POST');
    req.flush(formSchema);
    httpTestingController.verify();
  });

  it('should submit the dynamic form value', () => {
    const dynamicForm = dynamicFormConfig.form;

    formsService.submit$.and.returnValue(of('ok response'));

    dynamicFormService
      .submit$(dynamicForm, testFormUrl)
      .subscribe();

    expect(formsService.submit$).toHaveBeenCalledWith(dynamicForm, testFormUrl, undefined, undefined);
  });
});
