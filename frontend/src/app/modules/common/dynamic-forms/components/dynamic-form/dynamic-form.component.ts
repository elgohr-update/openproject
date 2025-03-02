import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from "@angular/core";
import { FormlyForm } from "@ngx-formly/core";
import { DynamicFormService } from "../../services/dynamic-form/dynamic-form.service";
import { IDynamicFieldGroupConfig, IOPDynamicFormSettings, IOPFormlyFieldSettings } from "../../typings";
import { I18nService } from "core-app/modules/common/i18n/i18n.service";
import { PathHelperService } from "core-app/modules/common/path-helper/path-helper.service";
import { catchError, finalize } from "rxjs/operators";
import { HalSource } from "core-app/modules/hal/resources/hal-resource";
import { NotificationsService } from "core-app/modules/common/notifications/notifications.service";
import { DynamicFieldsService } from "core-app/modules/common/dynamic-forms/services/dynamic-fields/dynamic-fields.service";
import { FormGroup } from "@angular/forms";
import { UntilDestroyedMixin } from "core-app/helpers/angular/until-destroyed.mixin";
import { FormsService } from "core-app/core/services/forms/forms.service";
import { HttpErrorResponse } from "@angular/common/http";

/**
* SETTINGS:
* The DynamicFormComponent can get its settings (payload and fields) in two ways:
*
* - @Input settings:
* Passing down an object that mimics a backend form configuration (IOPFormSettings),
* with and easier format (not _embedded) through the 'settings' @Input.
*
*   ```
*   <op-dynamic-form [settings]="formSettings">
*   </op-dynamic-form>
*   ```
*
* - Backend settings:
* In order to fetch its settings from the backend, the DynamicFormComponent will
* always need a backend endpoint to target. It can be provided in two ways:
*   - Through the 'resourcePath' @Input and, optionally, the 'resourceId' @Input if
*     we are editing an existing form.
*
*     ```
*     <op-dynamic-form [resourcePath]="resourcePath">
*     </op-dynamic-form>
*     ```
*
*   - Through the the 'formUrl' @Input. In this case we'll need to also provide the
*     formHttpMethod @Input if it is not POST.
*
*     ```
*     <op-dynamic-form [formUrl]="formUrl"
*                      [formHttpMethod]="formHttpMethod">
*     </op-dynamic-form>
*     ```
*
* USE CASES:
* The DynamicFormComponent can be used in two ways:
*
* - Standalone Form:
* In order to work as an standalone form, handling the submit operation,
* the DynamicFormComponent will need a backend endpoint to target as explained above.
 *
*     ```
*     <op-dynamic-form [resourcePath]="resourcePath">
*     </op-dynamic-form>
*     ```
*
* - FormGroup:
* In order to use the DynamicFormComponent as a formGroup, it will need a
* FormGroup to be passed through the dynamicFormGroup @Input.
*
*   ```
*   <op-dynamic-form  [dynamicFormGroup]="dynamicFormGroup">
*   </op-dynamic-form>`
*   ```
*
* FORM SETTINGS CUSTOMIZATIONS:
* The form settings can be customized in different ways:
*
* - initialPayload @Input:
*   Allows to provide and initial payload to the form settings request. Checkout
*   the [forms documentation](https://docs.openproject.org/api/forms/).
*
* - model @Input:
*   Allows to change model of the form.
*
* - fieldsSettingsPipe:
*   Allows to modify the dynamicFormFields settings before the form is rendered.
*
*   ```
*   <op-dynamic-form [formUrl]="formUrl"
*                    [formHttpMethod]="formHttpMethod"
*                    [initialPayload]="initialPayload">
*    </op-dynamic-form>
*    ```
*
* - fieldGroups:
*   Allows to create field groups programmatically. For example, the following group would
*   create an 'Advanced settings' field group with all the fields that are not 'name'
*   or 'parent' overriding the default collapsibleFieldGroupsCollapsed (showing them
*   uncollapsed).
*
*   ```
*    const fieldGroups = [{
*      name: 'Advanced settings',
*      fieldsFilter: (field) => !['name', 'parent'].includes(field.templateOptions?.property!),
*      settings: {
*        templateOptions: {
*          collapsibleFieldGroupsCollapsed: false
*        }
*      }
*    }];
*   ```
*/

@Component({
  selector: "op-dynamic-form",
  templateUrl: "./dynamic-form.component.html",
  styleUrls: ["./dynamic-form.component.scss"],
  providers: [
    DynamicFormService,
    DynamicFieldsService,
  ],
})
export class DynamicFormComponent extends UntilDestroyedMixin implements OnChanges {
  /** Backend form URL (e.g. https://community.openproject.org/api/v3/projects/dev-large/form) */
  @Input() formUrl?:string;
  /** When using the formUrl @Input(), set the http method to use if it is not 'POST' */
  @Input() formHttpMethod?:'post'|'patch' = 'post';
  /** Part of the URL that belongs to the resource type (e.g. '/projects' in the previous example)
  * Use this option when you don't have a form URL, the DynamicForm will build it from the resourcePath
  * for you (⌐■_■).
  */
  @Input() resourcePath?:string;
  /** Pass the resourceId in case you are editing an existing resource and you don't have the Form URL. */
  @Input() resourceId?:string;
  @Input() settings?:IOPFormSettings;
  @Input() dynamicFormGroup?:FormGroup;
  /** Initial payload to POST to the form */
  @Input() initialPayload:Object = {};
  @Input() set model(payload:IOPFormModel) {
    if (!this.innerModel && !payload) { return; }

    const formattedModel = this._dynamicFieldsService.getFormattedFieldsModel(payload);

    this.form.patchValue(formattedModel);
  }
  /** Chance to modify the dynamicFormFields settings before the form is rendered */
  @Input() fieldsSettingsPipe?:(dynamicFieldsSettings:IOPFormlyFieldSettings[]) => IOPFormlyFieldSettings[];
  /** Create fieldGroups programmatically */
  @Input() fieldGroups?:IDynamicFieldGroupConfig[];
  @Input() showNotifications = true;
  @Input() showValidationErrorsOn:'change'|'blur'|'submit'|'never' = 'submit';
  @Input() handleSubmit = true;
  @Input() helpTextAttributeScope?:string;

  @Output() modelChange = new EventEmitter<IOPFormModel>();
  @Output() submitted = new EventEmitter<HalSource>();
  @Output() errored = new EventEmitter<IOPFormErrorResponse>();

  form:FormGroup;
  fields:IOPFormlyFieldSettings[];
  formEndpoint?:string;
  inFlight:boolean;
  text = {
    save: this._I18n.t('js.button_save'),
    load_error_message: this._I18n.t('js.forms.load_error_message'),
    successful_update: this._I18n.t('js.notice_successful_update'),
    successful_create: this._I18n.t('js.notice_successful_create'),
    job_started: this._I18n.t('js.notice_job_started'),
  };
  noSettingsSourceErrorMessage = `DynamicFormComponent needs a settings, formUrl or resourcePath @Input
  in order to fetch its setting. Please provide one.`;
  noPathToSubmitToError = `DynamicForm needs a resourcePath or formUrl @Input in order to be submitted 
  and validated. Please provide one.`;
  innerModel:IOPFormModel;

  get model() {
    return this.form.getRawValue();
  }

  @ViewChild(FormlyForm)
  set dynamicForm(dynamicForm:FormlyForm) {
    this._dynamicFormService.registerForm(dynamicForm);
  }

  constructor(
    private _dynamicFormService:DynamicFormService,
    private _dynamicFieldsService:DynamicFieldsService,
    private _I18n:I18nService,
    private _pathHelperService:PathHelperService,
    private _notificationsService:NotificationsService,
    private _formsService:FormsService,
    private _changeDetectorRef:ChangeDetectorRef,
  ) {
    super();
  }

  setDisabledState(disabled:boolean):void {
    disabled ? this.form.disable() : this.form.enable();
  }

  ngOnChanges(changes:SimpleChanges) {
    if (
      changes.settings ||
      changes.resourcePath ||
      changes.resourceId ||
      changes.formUrl ||
      changes.formHttpMethod ||
      changes.dynamicFormGroup ||
      changes.initialPayload ||
      changes.fieldsSettingsPipe ||
      changes.fieldGroups
    ) {
      this.initializeDynamicForm(
        this.settings,
        this.resourcePath,
        this.resourceId,
        this.formUrl,
        this.initialPayload,
      );
    }
  }

  onModelChange(changes:any) {
    this.modelChange.emit(changes);
  }

  submitForm(form:FormGroup) {
    if (!this.handleSubmit) {
      return;
    }

    if (!this.formEndpoint) {
      throw new Error(this.noPathToSubmitToError);
    }

    this.inFlight = true;
    this._dynamicFormService
      .submit$(form, this.formEndpoint, this.resourceId, this.formHttpMethod)
      .pipe(
        finalize(() => this.inFlight = false),
      )
      .subscribe(
        (formResponse:HalSource|any) => {
          this.submitted.emit(formResponse);
          this.showNotifications && this.showSuccessNotification(formResponse);
        },
        (error:HttpErrorResponse) => {
          this.errored.emit(error?.error || error);
          this.showNotifications && this._notificationsService.addError(error?.error?.message || error?.message);
        },
      );
  }

  validateForm() {
    if (!this.formEndpoint) {
      throw new Error(this.noPathToSubmitToError);
    }

    return this._formsService.validateForm$(this.form, this.formEndpoint);
  }

  private initializeDynamicForm(
    settings?:IOPFormSettings,
    resourcePath?:string,
    resourceId?:string,
    formUrl?:string,
    payload?:Object,
  ) {
    const formEndPoint = this.getFormEndPoint(formUrl, resourcePath);
    if (!formEndPoint) {
      throw new Error(this.noSettingsSourceErrorMessage);
    }

    const isNewEndpoint = formEndPoint !== this.formEndpoint;
    if (isNewEndpoint) {
      this.formEndpoint = formEndPoint;
    }

    if (settings) {
      this.setupDynamicFormFromSettings();
    } else {
      this.setupDynamicFormFromBackend(this.formEndpoint, resourceId, payload);
    }
  }

  private getFormEndPoint(formUrl?:string, resourcePath?:string):string|undefined {
    if (formUrl) {
      return formUrl.endsWith(`/form`) ?
        formUrl.replace(`/form`, ``) :
        formUrl;
    }

    if (resourcePath) {
      return `${this._pathHelperService.api.v3.apiV3Base}${resourcePath}`;
    }

    return;
  }

  private setupDynamicFormFromBackend(formEndpoint?:string, resourceId?:string, payload?:Object) {
    this._dynamicFormService
      .getSettingsFromBackend$(formEndpoint, resourceId, payload)
      .pipe(
        catchError(error => {
          this._notificationsService.addError(this.text.load_error_message);
          throw error;
        }),
      )
      .subscribe(dynamicFormSettings => this.setupDynamicForm(dynamicFormSettings));
  }

  private setupDynamicFormFromSettings() {
    const formattedSettings:IOPFormSettingsResource = {
      _embedded: {
        payload: this.settings!.payload,
        schema: this.settings!.schema,
      },
    };
    const dynamicFormSettings = this._dynamicFormService.getSettings(formattedSettings);

    this.setupDynamicForm(dynamicFormSettings);
  }

  private setupDynamicForm({ fields, model, form }:IOPDynamicFormSettings) {
    if (this.fieldsSettingsPipe) {
      fields = this.fieldsSettingsPipe(fields);
    }

    if (this.fieldGroups) {
      fields = this._dynamicFieldsService.getFormlyFormWithFieldGroups(this.fieldGroups, fields);
    }

    this.fields = fields;
    this.innerModel = model;
    this.form = this.dynamicFormGroup || form;

    this._changeDetectorRef.detectChanges();
  }

  private showSuccessNotification(formResponse:HalSource|any):void {
    let submit_message;

    if (formResponse?.jobId) {
      const title = formResponse?.payload?.title;

      submit_message = `${title || ''} ${this.text.job_started}`;
    } else {
      submit_message = this.resourceId ? this.text.successful_update : this.text.successful_create;
    }

    this._notificationsService.addSuccess(submit_message);
  }
}
