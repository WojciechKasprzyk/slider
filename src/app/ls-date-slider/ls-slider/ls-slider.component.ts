import {
  AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef,
  Component,
  ElementRef, EventEmitter, HostListener, Input,
  OnDestroy,
  Output,
  ViewChild
} from '@angular/core';
import { fromEvent, Subject, BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged, filter, mergeWith, takeUntil, tap } from 'rxjs/operators';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * TODO
 * - accessibility
 * - custom styles guide
 * - dark theme
 * - readme
 * - tests
 *
 * - resizeAfterTemplateIsReRendered setTimeout issue
 *
 * DONE
 * - check how io range slider did touch action none on document, maybe add class to body while sliding
 * - make some methods static
 * - steps labels
 * - custom buttons
 * - docs
 * - use ngClass
 * - custom steps
 * - 2 way binding
 * - touch events
 * - form
 * - setters refactoring
 * - showGrid
 * - hideSideSteps
 * - color slider with gradient .range-slider changing page color gradient and buttons colors !!!!!! IMPORTANT
 *
 * */


@Component({
  selector: 'ls-slider',
  templateUrl: './ls-slider.component.html',
  styleUrls: ['./ls-slider.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: LsSliderComponent
    }
  ]
})
export class LsSliderComponent implements AfterViewInit, OnDestroy, ControlValueAccessor {
  /**
   * TOTAL STEPS
   * Maximum possible value
   */
  private _ceilValue!: number;

  /**
   * Store buttons current values
   */
  private _from = 0;
  private _to = 0;
  private _value = 0;

  /**
   * Store buttons last emitted values
   */
  private lastEmittedFromValue = 0;
  private lastEmittedToValue = 0;

  /**
   * Stores clientX mouse position on mouseDown event (when mouse moving starts)
   */
  private startCursorPosition!: number;

  /**
   * Is Set in initializeSliderBarSizes method.
   * Is used to calculate maximum translate value
   */
  private sliderBarWidth!: number;

  /**
   * Initially buttons are placed at the beginning of slider bar (translate 0px)
   * The high value button can be moved to the end of slider bar.
   * To keep experience visually consistent its value is equal to the difference between slider bar width and button width.
   * Calculated in initializeSliderBarSizes method.
   */
  private maximumTranslateValue!: number;

  /**
   * -Offset properties store respectively their elements initial position when mouseDown event occurs (when mouse moving starts)
   * elementOffset is used when single button is dragging
   * left- and rightButtonOffset are used when both buttons are dragging (selected range is dragging)
   */
  private elementOffset!: number;
  private leftButtonOffset!: number;
  private rightButtonOffset!: number;

  /**
   * Is true when slided has been touched
   * */
  private touched = false;

  private readonly ngUnsubscribe = new Subject<null>();
  private readonly reactiveFormUnsubscribe = new Subject<null>();
  private registerReactiveFormsChange?: BehaviorSubject<SliderInputValue>;
  private registerReactiveFormsChange$?: Observable<SliderInputValue>;
  private readonly mouseUp$ = fromEvent(document, 'mouseup')
    .pipe(mergeWith(fromEvent(document, 'touchend')));
  /**
   * Component is listening on whole document to provide user possibility
   * to dragging buttons over document, not only over this component (slider bar).
   */
  private readonly mousemove$ = fromEvent(document, 'mousemove')
    .pipe(
      mergeWith(fromEvent(document, 'touchmove')),
      filter(_ => !this.disabled && !!this.draggingElement)
    );

  /**
   *
   * Default Value is equal to 17, because of space-evenly, it's 5px * 3 + 2 * span.width
   */
  @Input() buttonWidth: number = 17;

  /**
   * If true
   *    Then there are both buttons to select range
   * If false
   *    Then there is one button to select single value
   * */
  @Input() rangeSelector: boolean = true;

  /**
   * If true
   *    Then emits new value each time any button value has changed while moving
   * If false
   *    Then emits value when dragging end
   * */
  @Input() emitValueWhileMoving: boolean = false;

  /**
   * Disables slider
   * */
  @Input() disabled: boolean = false;

  /**
   * Enables setting both button the same value
   * */
  @Input() enableButtonOverlapping: boolean = true;

  /**
   * Enables swapping (shuffling) buttons while dragging over each other
   * */
  @Input() enableButtonsShuffle: boolean = true;

  /**
   * Shows steps grid
   * */
  @Input() showGrid: boolean  = true;

  /**
   * Hides the first and the last steps
   * */
  @Input() hideSideSteps: boolean  = false;

  /**
   * @description
   * Label are placed over the buttons
   *
   * @example
   * Display current value over the button
   *
   * ```html
   * [(from)]="fourthFrom"
   * [(to)]="fourthTo"
   * [fromLabel]="fourthFrom | toStringPipe"
   * [toLabel]="fourthTo | toStringPipe"
   * [emitValueWhileMoving]="true"
   * ```
   * */
  @Input() fromLabel?: string;
  @Input() toLabel?: string;
  @Input() valueLabel?: string;

  /**
   * _from property setter
   * Validates value and sets
   * */
  @Input() set from(value: number) {
    this._from = this.getValidValue(value);
    this.lastEmittedFromValue = this._from;
  }

  /**
   * _to property setter
   * Validates value and sets
   * */
  @Input() set to(value: number) {
    this._to = this.getValidValue(value);
    this.lastEmittedToValue = this._to;
  }

  /**
   * _value property setter
   * Validates value and sets
   * */
  @Input() set value(value: number) {
    this._value = this.getValidValue(value);
    this.lastEmittedToValue = this._value;
  }

  /**
   * _ceilValue property setter
   * Sets the value, initializes steps for grid and calls init method
   * */
  @Input() set ceilValue(val: number) {
    this._ceilValue = val;
    this.steps = new Array(val + 1);
    this.init();
  }

  /**
   * _stepsLabels property setter
   * Sets both the label and steps for grid
   * */
  @Input() set stepsLabels(value: string[]) {
    this._stepsLabels = value;
    this.steps = value;
  }

  /**
   * Stores currently dragging element - left button, right button or selected range (it means both buttons)
   */
  draggingElement?: HTMLElement | null;

  /**
   * Steps labels
   * */
  _stepsLabels?: string[];

  /**
   * Iterable property used to display steps grid over slider
   * */
  steps: Array<string | undefined> = [];

  /**
   * Prevent from animating slider at the very beginning
   * */
  animationEnabled = false;

  /**
   * Emit button values when they has been changed
   */
  @Output() readonly fromChange = new EventEmitter<number>();
  @Output() readonly toChange = new EventEmitter<number>();
  @Output() readonly valueChange = new EventEmitter<number>();

  /**
   * Emits on mouse up event (dragging end)
   */
  @Output() readonly draggingEnd = new EventEmitter();

  /**
   * HTML elements - both buttons, slider bar which buttons are placed on and highlighted range between buttons
   */
  @ViewChild('buttonLeft') private readonly buttonLeft?: ElementRef;
  @ViewChild('buttonRight') private readonly buttonRight!: ElementRef;
  @ViewChild('sliderBar') private readonly sliderBar!: ElementRef;
  @ViewChild('selectedRange') private readonly selectedRange!: ElementRef;

  keydown(event: KeyboardEvent) {
    const keyCodes = [37,38,39,40];
    if(keyCodes.includes(event.keyCode)) {
      event.preventDefault();
      let newPossibleValue;
      if (event.keyCode === 37 || event.keyCode === 40) {
        if (event.target === this.buttonRight.nativeElement) {
          // this.enableButtonsShuffle
          // this.enableButtonOverlapping
          newPossibleValue = this.getValidValue(this.toOrValue -1);
          if(newPossibleValue < this.from) {
            this.buttonLeft?.nativeElement.focus();
            this.from = newPossibleValue;
          } else {
            this.to = newPossibleValue;
          }
        } else {
          newPossibleValue = this.getValidValue(this.from - 1);
          this.from = newPossibleValue;
        }
      } else {
        if (event.target === this.buttonRight.nativeElement) {
          // this.enableButtonsShuffle
          // this.enableButtonOverlapping
          newPossibleValue = this.toOrValue +1;
          this.to = newPossibleValue;
        } else {
          newPossibleValue = this.from + 1;
          this.from = newPossibleValue;
        }
      }
      this.adjustElements();
    }
  }

  /**
   * _ceilValue getter
   * */
  get ceilValue(): number {
    return this._ceilValue;
  }

  /**
   * Return buttons current value
   * */
  get to(): number {return this._to;}
  get from(): number {return this._from;}
  get value(): number {return this._value;}

  /**
   * Returns _to or _value depending on rangeSelector value
   * */
  get toOrValue(): number {
    return this.rangeSelector ? this._to : this._value;
  }

  constructor(private cdr: ChangeDetectorRef) {
    /**
     * Subscribe to mouseUp event - dragging end
     * Emits value while moving if {{emitValueWhileMoving}} input is true
     */
    this.mouseUp$
      .pipe(
        tap(() => {
          if (this.draggingElement) {
            if(!this.emitValueWhileMoving) {
              this.emitShiftedValues()
            }
            this.draggingElement = null;
            this.cdr.markForCheck();
            this.draggingEnd.observed && this.draggingEnd.emit();
            this.adjustElements();
          }
        }),
        takeUntil(this.ngUnsubscribe)
      ).subscribe();
  }

  /** REACTIVE FORM METHODS*/

  /**
   * Marks slider as touched
   * */
  private markAsTouched() {
    if (!this.touched) {
      this.onTouched();
      this.touched = true;
    }
  }

  /** ControlValueAccessor description
   * @description
   * Registers a callback function that is called when the control's value
   * changes in the UI.
   *
   * This method is called by the forms API on initialization to update the form
   * model when values propagate from the view to the model.
   *
   * When implementing the `registerOnChange` method in your own value accessor,
   * save the given function so your class calls it at the appropriate time.
   *
   * @usageNotes
   * ### Store the change function

   * @param onChange The callback function to register
   */
  registerOnChange(onChange: (changes: SliderInputValue) => void): void {
    this.onChange = onChange;
  }

  /** ControlValueAccessor description
   * @description
   * Registers a callback function that is called by the forms API on initialization
   * to update the form model on blur.
   *
   * When implementing `registerOnTouched` in your own value accessor, save the given
   * function so your class calls it when the control should be considered
   * blurred or "touched".
   *
   * @usageNotes
   * ### Store the callback function
   *
   * @param onTouched The callback function to register
   */
  registerOnTouched(onTouched: () => void): void {
    this.onTouched = onTouched;
  }

  /** ControlValueAccessor description
   * @description
   * Function that is called by the forms API when the control status changes to
   * or from 'DISABLED'. Depending on the status, it enables or disables the
   * appropriate DOM element.
   *
   * @usageNotes
   * The following is an example of writing the disabled property to a native DOM element:
   *
   * @param disabled The disabled status to set on the element
   */
  setDisabledState(disabled: boolean): void {
    this.disabled = disabled;
  }

  /** ControlValueAccessor description
   * @description
   * Writes a new value to the element.
   *
   * This method is called by the forms API to write to the view when programmatic
   * changes from model to view are requested.
   *
   * @usageNotes
   * ### Write a value to the element
   *
   * @param value The new value for the slider
   *
   * @ownDescription
   * Sets Slider Input value by using reactive forms.
   * The value is type of {{SliderInputValue}}
   * Ignores null values
   * For range selection mode, sets both {{_to}} and {{_from}} values, checking validation
   * For single button selection mode, sets {{_value}}, checking validation
   */
  writeValue(value: SliderInputValue): void {
    if (value == null) {
      throw new Error(`Value cannot be ${value}`)
    }

    if (this.rangeSelector) {
      const _value = value as RangeInputValue;
      if (_value.to == null || _value.from == null || isNaN(_value.to) || isNaN(_value.from)) {
        throw new Error('Input has to be type of RangeInputValue ({from: number; to: number}) while in range value mode. Values cannot be NaN');
      } else {
        if (_value.from < 0) throw new Error(`'from' property cannot be less then 0`);
        if (_value.to > this.ceilValue) throw new Error(`'to' property cannot be more then ceilValue`);
        if (_value.to < _value.from) throw new Error(`'to' property cannot be less then 'from' property`);
        this.updateValues(_value.from, _value.to);
        this.subscribeToReactiveForm({from: _value.from, to: _value.to});
      }
    } else {
      if (typeof value === 'number' && !isNaN(value)) {
        if (value < 0) throw new Error(`value has to be less then 0`);
        if (value > this.ceilValue) throw new Error(`value cannot be more then ceilValue`);
        this.value = value;
        this.subscribeToReactiveForm(value);
      } else {
        throw new Error(`Input value has to be type of number while in single value mode`)
      }
    }
  }

  /** REACTIVE FORM METHODS END*/

  /**
   * Updates low and high value and
   * calls init method to resize slider elements.
   */
  updateValues(lowValue: number, highValue: number): void {
    this.from = lowValue;
    this.to = highValue;
    this.init();
  }

  /**
   * @param event - MouseEvent
   * @param element - left/right button or selectedRange
   * selectedRange stands for both buttons
   */
  mouseDownHandler(event: MouseEvent | TouchEvent, element: HTMLElement): void {
    if (this.disabled) {
      return;
    }

    this.markAsTouched();
    if (event.cancelable) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.draggingElement = element;
    this.startCursorPosition = LsSliderComponent.getEventClientX(event);
    if (element === this.selectedRange.nativeElement) {
      if (this.buttonLeft) {
        this.leftButtonOffset = LsSliderComponent.getTranslateValueOf(this.buttonLeft.nativeElement);
      }
      this.rightButtonOffset = LsSliderComponent.getTranslateValueOf(this.buttonRight.nativeElement);
    } else {
      this.elementOffset = LsSliderComponent.getTranslateValueOf(this.draggingElement);
    }
  }

  /**
   *  Supports both Mouse- and TouchEvent
   *  As long as they use different data model clientX value has to be got in a different way
   * */
  static getEventClientX(event: MouseEvent | TouchEvent): number {
    if ((event as TouchEvent).touches) {
      return (event as TouchEvent).touches[0].clientX;
    }

    return (event as MouseEvent).clientX;
  }

  /**
   * @param event - MouseEvent or TouchEvent.
   *
   * Does nothing if draggingElement is null.
   * Otherwise, handles event and check:
   *    If range between buttons is dragged
   *        then calculates both buttons translations and moves them.
   *    If single button is dragged then:
   *        - calculates translate value
   *        - validates translate value
   *        - corrects translate value according to another button placement
   *        - move dragged button
   *
   *    If {{emitValueWhileMoving}} is enabled
   *        then emits new buttons values if they has been changes
   *
   *    Then does resize highlighted range between buttons
   */
  private onMouseMove(event: MouseEvent | TouchEvent) {
    if (this.draggingElement) {
      const clientX = LsSliderComponent.getEventClientX(event);
      if (this.draggingElement === this.selectedRange.nativeElement) {
        const translateLeft = this.leftButtonOffset + clientX - this.startCursorPosition;
        const translateRight = this.rightButtonOffset + clientX - this.startCursorPosition;
        this.moveBothButtons(translateLeft, translateRight);
      } else {
        const translateValue = this.calculateTranslateValue(clientX);
        const validTranslateValue = this.getValidTranslationValue(translateValue);
        const correctedTranslateValue = this.correctTranslateValueAccordingToAnotherButton(validTranslateValue);
        this.moveButton(correctedTranslateValue);
      }
      if (this.emitValueWhileMoving) {
        this.emitShiftedValues();
      }
      this.resizeSelectedRange();
    }
  };

  /**
   * Calculates element translation value as a sum of
   *    - x - its initial translation value
   *    - d - difference between cursor current X position and initial X position.
   *          d should be interpreted as mouse distance done by user from mouse down to current moment.
   *
   * Initial values, mentioned above, are set on mouse down.
   * Returned value is a button new translate value, not validated yet
   */
  private calculateTranslateValue(clientX: number): number {
    return this.elementOffset + clientX - this.startCursorPosition;
  }

  /**
   * @param translateValue - translation value in pixels
   *
   * If argument is below 0:
   *    then returns 0,
   * If argument is bigger than maximumTranslateValue:
   *    then returns maximumTranslateValue,
   * Otherwise returns argument value;
   */
  private getValidTranslationValue(translateValue: number): number {
    if (translateValue < 0) {
      return 0;
    } else if (translateValue > this.maximumTranslateValue) {
      return this.maximumTranslateValue;
    }

    return translateValue;
  }

  /**
   * @param translateValue - dragging button new translation value
   *
   * Calculates predicted distance between buttons after translation and:
   * If it is bigger than minimal space between buttons
   *    then returns argument value
   * Otherwise
   *    If {{enableButtonsShuffle}} is true and {{minimalSpaceBetweenButtons}} returns 0
   *      then shuffles (swaps) the buttons and marks for check
   *
   * Then
   *    If left button is dragged
   *        then returns translate value of one step before right button
   *    If right button is dragged
   *        then returns translate value of one step after left button
   */
  private correctTranslateValueAccordingToAnotherButton(translateValue: number): number {
    const futureSpaceBetweenButtons = this.calculateFutureButtonsDistanceDifference(translateValue);
    if (futureSpaceBetweenButtons > this.minimalSpaceBetweenButtons) {
      return translateValue;
    } else {
      if(this.enableButtonsShuffle &&  this.minimalSpaceBetweenButtons === 0) {
        this.shuffleButtons();
        this.cdr.markForCheck();
      }
    }

    if (this.buttonLeft && this.draggingElement === this.buttonLeft.nativeElement) {
      return LsSliderComponent.getTranslateValueOf(this.buttonRight.nativeElement) - this.minimalSpaceBetweenButtons;
    }

    return LsSliderComponent.getTranslateValueOf(this.buttonLeft?.nativeElement) + this.minimalSpaceBetweenButtons;
  }

  /**
   * Regarding to dragging button
   * save dropped button value basing on dragging button position
   * adjust dropped button to right place basing on its value
   * do shuffle (swap) buttons
   * */
  shuffleButtons() {
    if (this.draggingElement === this.buttonRight.nativeElement) {
      //save dropped button value basing on its position
      this.to = this.calculateValueFromTranslation(this.draggingElement!);
      // adjust dropped button to right place basing on its value
      this.moveButton(this.calculateTranslationFromValue(this._to));
      // do shuffle
      this.draggingElement = this.buttonLeft?.nativeElement;
    } else {
      //save dropped button value basing on its position
      this.from = this.calculateValueFromTranslation(this.draggingElement!);
      // adjust dropped button to right place basing on its value
      this.moveButton(this.calculateTranslationFromValue(this._from));
      // do shuffle
      this.draggingElement = this.buttonRight.nativeElement;
    }
  }

  /**
   * @param futureButtonTranslation - translate value to be set
   * Predicts what would distance between buttons be, if argument value was applied
   */
  private calculateFutureButtonsDistanceDifference(futureButtonTranslation: number): number {
    if (this.buttonLeft && this.draggingElement === this.buttonLeft.nativeElement) {
      return LsSliderComponent.getTranslateValueOf(this.buttonRight.nativeElement) - futureButtonTranslation;
    }

    return futureButtonTranslation - LsSliderComponent.getTranslateValueOf(this.buttonLeft?.nativeElement);

  }

  /**
   * Calls methods which emit shifted value according to dragging element
   * Calls {{registerReactiveFormsChange}} next method
   */
  private emitShiftedValues(): void {
    if (this.draggingElement === this.selectedRange.nativeElement) {
      this.emitBothShiftedValues();
    } else {
      const shiftedValue = this.calculateValueFromTranslation(this.draggingElement!);
      if (this.buttonLeft && this.draggingElement === this.buttonLeft.nativeElement) {
        this.emitLowValueIfHasBeenChanged(shiftedValue);
      } else {
        this.emitHighValueIfHasBeenChanged(shiftedValue);
      }
    }
    this.registerReactiveFormsChange?.next(this.reactiveFormOutputHighValue);
  }

  /**
   * @param newLowValue
   *
   * If argument value is different than last emitted low value
   *    then sets and emits new low value, updates last emitted low value
   */
  private emitLowValueIfHasBeenChanged(newLowValue: number): void {
    if (this.lastEmittedFromValue !== newLowValue) {
      // shift and emit lowValue
      this.from = newLowValue;
      this.fromChange.observed && this.fromChange.emit(this._from);
    }
  }

  /**
   * @param newHighValue
   *
   * If argument value is different than last emitted high value
   *    then sets and emits new low value, updates last emitted high value
   *
   * Sets _to or _value property depending on {{rangeSelector}} value
   */
  private emitHighValueIfHasBeenChanged(newHighValue: number): void {
    if  (this.lastEmittedToValue !== newHighValue) {
      // shift and emit highValue
      if (this.rangeSelector) {
        this.to = newHighValue;
        this.toChange.observed && this.toChange.emit(this._to);
      } else {
        this.value = newHighValue;
        this.valueChange.observed && this.valueChange.emit(this._value);
      }
    }
  }

  /**
   * Return reactive form value using type depending on {{rangeSelector}} value
   * */
  private get reactiveFormOutputHighValue() {
    if (this.rangeSelector) {
      return {to: this._to, from: this._from};
    } else {
      return this._value;
    }
  }

  /**
   * Calculates new low and high values and emits them if they are different than their last emitted values
   */
  private emitBothShiftedValues(): void {
    if (this.buttonLeft) {
      const newLowValue =  this.calculateValueFromTranslation(this.buttonLeft.nativeElement);
      this.emitLowValueIfHasBeenChanged(newLowValue);
    }
    const newHighValue =  this.calculateValueFromTranslation(this.buttonRight.nativeElement);
    this.emitHighValueIfHasBeenChanged(newHighValue);
  }

  /**
   * Moves buttons to current step positions
   * Resizes selected Range after moving
   */
  private adjustElements(): void {
    this.moveBothButtons(this.calculateTranslationFromValue(this._from), this.calculateTranslationFromValue(this.toOrValue));
    this.resizeSelectedRange();
  }

  /**
   * @param correctedTranslateValue - translation value in pixels
   *
   * Validates argument and translates currently dragging button
   */
  private moveButton(correctedTranslateValue: number): void {
    this.draggingElement!.style.transform = LsSliderComponent.getTranslateValueCenteredVertically(correctedTranslateValue);
  }

  /**
   * @param leftButtonTranslation - translation of left button in pixels, has to be bigger than 0
   * @param rightButtonTranslation - translation of right button in pixels. cannot be bigger than maximum translate value
   *
   * Sets value of transform value of both buttons, if both arguments are valid
   */
  private moveBothButtons(leftButtonTranslation: number, rightButtonTranslation: number): void {
    if (leftButtonTranslation < 0 || rightButtonTranslation > this.maximumTranslateValue) {
      return;
    }
    if(this.buttonLeft) {
      this.buttonLeft.nativeElement.style.transform = LsSliderComponent.getTranslateValueCenteredVertically(leftButtonTranslation);
    }
    this.buttonRight.nativeElement.style.transform = LsSliderComponent.getTranslateValueCenteredVertically(rightButtonTranslation);
  }

  /**
   * If enableButtonOverlapping is true
   *    Then return 0 allowing buttons overlapping
   * Otherwise
   *    Minimal space between buttons is equal one step width
   *    Protects user from selecting the same start and end date
   *    Provides user possibility to select the smaller possible time frame equal step value
   */
  private get minimalSpaceBetweenButtons(): number {
    if (this.enableButtonOverlapping) {
      return 0;
    }

    return this.sliderBarWidth / this.ceilValue;
  }

  /**
   * value = ceil * currentTranslation / maxTranslation
   */
  private calculateValueFromTranslation(element: HTMLElement): number {
    return Math.round(this.ceilValue * LsSliderComponent.getTranslateValueOf(element) / (this.maximumTranslateValue));
  }

  /**
   * @param value - button value
   *
   * currentTranslation = value * maxTranslation / ceil
   */
  private calculateTranslationFromValue(value: number): number {
    return value * (this.maximumTranslateValue) / this.ceilValue;
  }

  /**
   * Just get translate value from transform property of passed HTML element
   */
  static getTranslateValueOf(element?: HTMLElement): number {
    if(element) {
      return +element.style.transform.slice(10, -9);
    }

    return 0;
  }

  /**
   * @param translateValue - translate value in pixels
   * Returns value dedicated for transform css property containing:
   *    - horizontal shift value of passed argument
   *    - vertical shift value of -50%
   */
  static getTranslateValueCenteredVertically(translateValue: number): string {
    return `translate(${translateValue}px,-50%)`;
  }

  /**
   * Sets sliderBarWidth property with HTML element width value.
   * sliderBarWidth is used in many calculations so It HAS TO be set very first and update very first on any window changes (resizing)
   * maximumTranslateValue is equal to the difference between slider bar width and button width (CONST).
   */
  private initializeSliderBarSizes(): void {
    if (this.sliderBar) {
      this.sliderBarWidth = this.sliderBar.nativeElement.clientWidth;
      this.maximumTranslateValue = this.sliderBarWidth - this.buttonWidth;
    }
  }

  /**
   * Places buttons respectively at the beginning and at the end of slider bar, if there is no translate value set yet;
   * Places buttons in proper places while window resizing or after range (ceil, low/high value) has been changed externally (not by sliding)
   */
  private placeButtons(): void {
    if (this.buttonLeft) {
      if (this.buttonLeft.nativeElement.style.transform) {
        this.buttonLeft.nativeElement.style.transform = LsSliderComponent.getTranslateValueCenteredVertically(this.calculateTranslationFromValue(this._from));
      } else {
        this.buttonLeft.nativeElement.style.transform =  LsSliderComponent.getTranslateValueCenteredVertically(0);
      }
    }

    if (this.buttonRight) {
      if (this.buttonRight.nativeElement.style.transform) {
        this.buttonRight.nativeElement.style.transform = LsSliderComponent.getTranslateValueCenteredVertically(this.calculateTranslationFromValue(this.toOrValue));
      } else {
        this.buttonRight.nativeElement.style.transform = LsSliderComponent.getTranslateValueCenteredVertically(this.maximumTranslateValue);
      }
    }
  }

  /**
   * Resizes highlighted element between button to fit new selected range.
   * Selected range should start in half of left button and end in half of right one.
   * Element horizontal translation is equal to sum of left button translation and half of button width.
   * Element width is equal to difference between translations of left and right button.
   */
  private resizeSelectedRange(): void {
    if (this.selectedRange) {
      const selectedRangeTranslations = LsSliderComponent.getTranslateValueOf(this.buttonLeft?.nativeElement) + (+this.rangeSelector * this.buttonWidth / 2);
      const selectedRangeWidth = LsSliderComponent.getTranslateValueOf(this.buttonRight.nativeElement) - LsSliderComponent.getTranslateValueOf(this.buttonLeft?.nativeElement) + (+!this.rangeSelector * this.buttonWidth / 2);

      this.selectedRange.nativeElement.style.transform = LsSliderComponent.getTranslateValueCenteredVertically(selectedRangeTranslations);
      this.selectedRange.nativeElement.style.width = `${selectedRangeWidth}px`;
    }
  }

  /**
   * Returns button valid value
   * */
  private getValidValue(value: number): number {
    return this.getMaxValue(LsSliderComponent.getMinValue(value));
  }

  /**
   * Returns button max value that cannot be bigger than _ceilValue
   * */
  private getMaxValue(value: number): number {
    if (this.ceilValue < value) {
      console.error(`'to' value cannot be bigger than ceilValue.\nTrying set value of ${value}, cannot be more than ${this.ceilValue}`);
      return this.ceilValue;
    }
    return value;
  }

  /**
   * Returns button min value that cannot be smaller than 0
   * */
  static getMinValue(value: number): number {
    if (value < 0) {
      console.error(`'from' value cannot be smaller than 0.\nTrying set value of ${value}`);
      return 0;
    }
    return value;
  }

  /**
   * onChange method for Reactive Forms
   * */
  private onChange = (changes: SliderInputValue) => {};

  /**
   * onTouched method for Reactive Forms
   * */
  private onTouched = () => {};

  /**
   * Method calls resize method and emits event informing parent component that slider is not touched yet
   * Method should be called after input values has been changed
   */
  private init(): void {
    /**
     * In case of slider bar width has been changed while setting new input value.
     * It is to be call after template is re-rendered to make sure that correct slider bar width is set.
     */
    setTimeout(() => this.resize());
  }

  /**
   * Initializes slider bar width, places buttons in proper places and resizes selected range.
   */
  @HostListener('window:resize')
  private resize(): void {
    this.initializeSliderBarSizes();
    this.placeButtons();
    this.resizeSelectedRange();
  }

  ngAfterViewInit(): void {
    this.init();
    setTimeout(() => this.animationEnabled = true);
    this.mousemove$
      .pipe(
        tap((event) => {
          if (event.cancelable) {
            event.preventDefault();
            event.stopPropagation();
          }
          this.onMouseMove(event as MouseEvent | TouchEvent);
        }),
        takeUntil(this.ngUnsubscribe)
      ).subscribe();
  }

  ngOnDestroy(): void {
    this.ngUnsubscribe.next && this.ngUnsubscribe.next(null);
    this.ngUnsubscribe.complete && this.ngUnsubscribe.complete();

    this.reactiveFormUnsubscribe.next && this.reactiveFormUnsubscribe.next(null);
    this.reactiveFormUnsubscribe.complete && this.reactiveFormUnsubscribe.complete();
  }

  /**
   * Unsubscribes from previous value change
   * Subscribes to {{registerReactiveFormsChange$}} observable each time the new value has been written by reactive forms patch method
   * Calls onChange method if new value has been emitted
   * */
  private subscribeToReactiveForm(value: SliderInputValue) {
    this.reactiveFormUnsubscribe.next(null);
    this.registerReactiveFormsChange = new BehaviorSubject<SliderInputValue>(value);
    this.registerReactiveFormsChange$ = this.registerReactiveFormsChange.asObservable();
    this.registerReactiveFormsChange$
      .pipe(
        distinctUntilChanged<SliderInputValue>((previous, current) => {
          if (this.rangeSelector) {
            return(previous as RangeInputValue).to === (current as RangeInputValue).to
              && (previous as RangeInputValue).from === (current as RangeInputValue).from;
          }

          return previous === current;
        }),
        tap((changes: SliderInputValue) => this.onChange(changes)),
        takeUntil(this.reactiveFormUnsubscribe)
      ).subscribe()
  }
}

/**
 * Data model for both slider selection mode - range and single value
 * */
type SliderInputValue = RangeInputValue | number

/**
 * Data model for the slider range selection mode
 * */
interface RangeInputValue {
  from: number;
  to: number;
}
