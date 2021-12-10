import {
  AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef,
  Component,
  ElementRef, EventEmitter, HostListener, Input,
  OnDestroy,
  Output,
  ViewChild, ViewEncapsulation
} from '@angular/core';
import { fromEvent, Subject, BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged, mergeWith, takeUntil, tap } from 'rxjs/operators';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * TODO
 * - custom steps
 * - custom buttons
 * - custom styles guide
 * - use ngClass
 * - color slider with gradient .range-slider changing page color gradient and buttons colors !!!!!! IMPORTANT
 * - steps labels
 * - dark theme
 * - docs
 * - readme
 * - make some methods static
 * - tests
 * - check how io range slider did touch action none on document, maybe add class to body while sliding
 *
 * - resizeAfterTemplateIsReRendered setTimeout issue
 *
 * DONE
 * - 2 way binding
 * - touch events
 * - form
 * - setters refactoring
 * - showGrid
 * - hideSideSteps
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
      multi:true,
      useExisting: LsSliderComponent
    }
  ]
})
export class LsSliderComponent implements AfterViewInit, OnDestroy, ControlValueAccessor {
  /**
   * Stores currently dragging element - left button, right button or selected range (it means both buttons)
   */
  draggingElement?: HTMLElement | null;

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
   * CONSTANT property
   * Because of space-evenly, it's 5px * 3 + 2 * span.width
   */
  readonly BUTTON_WIDTH = 17;

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

  private readonly ngUnsubscribe = new Subject<null>();
  private readonly mouseUp$ = fromEvent(document, 'mouseup')
    .pipe(mergeWith(fromEvent(document, 'touchend')));
  /**
   * Component is listening on whole document to provide user possibility
   * to dragging buttons over document, not only over this component (slider bar).
   */
  private readonly mousemove$ = fromEvent(document, 'mousemove')
    .pipe(mergeWith(fromEvent(document, 'touchmove')));

  /**
   * Used in init method to make sure that correct slider bar width is set.
   * Needed only if slider bar width changes while setting new input value.
   */
  @Input() resizeAfterTemplateIsReRendered: boolean = true;

  /**
   * TODO
   * */
  @Input() rangeSelector: boolean = true;

  /**
   * TODO
   * */
  @Input() emitValueWhileMoving: boolean = false;

  /**
   * TODO
   * */
  @Input() disabled: boolean = false;

  /**
   * TODO
   * */
  @Input() enableButtonOverlapping: boolean = true;

  /**
   * TODO
   * */
  @Input() enableButtonsShuffle: boolean = true;

  /**
   * TODO
   * */
  @Input() showGrid: boolean  = true;

  /**
   * TODO
   * */
  @Input() hideSideSteps: boolean  = false;

  // /**
  //  * TODO
  //  * */
  // @Input() leftButtonInnerHtml: string = `<span></span><span></span>`;
  // @Input() rightButtonInnerHtml: string = `<span></span><span></span>`;

  /**
   * TODO
   * */
  @Input() set from(value: number) {
    this._from = this.getMinValue(value);
    this.lastEmittedFromValue = this._from;
  }

  /**
   * TODO
   * */
  @Input() set to(value: number) {
    this._to = this.getMaxValue(value);
    this.lastEmittedToValue = this._to;
  }

  /**
   * TODO
   * */
  @Input() set value(value: number) {
    this._value = this.getMaxValue(this.getMinValue(value));
    this.lastEmittedToValue = this._value;
  }

  @Input() set ceilValue(val: number) {
    this._ceilValue = val;
    this.steps = new Array(val + 1);
    this.init();
    // this.updateValues(0, val);
  }

  /**
   * TODO
   * */
  @Input() set stepsLabels(value: string[]) {
    this._stepsLabels = value;
    this.steps = value;
  }

   _stepsLabels?: string[];

  /**
   * TODO
   * */
  steps: Array<string | undefined> = [];

  /**
   * Prevent from animating slider at the very beginning
   * */
  animationEnabled = false;

  /**
   * Emit button values when they has been changed
   * TODO doc
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

  get ceilValue(): number {
    // if (this._stepsLabels) {
    //   return this._stepsLabels.length - 1;
    // }

    return this._ceilValue;
  }

  /**
   * TODO
   * */
  get to(): number {return this._to;}
  get from(): number {return this._from;}
  get value(): number {return this._value;}

  get toOrValue(): number {
    return this.rangeSelector ? this._to : this._value;
  }

  private readonly reactiveFormUnsubscribe = new Subject<null>();
  private registerReactiveFormsChange?: BehaviorSubject<SliderInputValue>;
  private registerReactiveFormsChange$?: Observable<SliderInputValue>;

  constructor(private cdr: ChangeDetectorRef) {
    /**
     * Subscribe to mouseUp event - dragging end
     * TODO doc emitValueWhileMoving
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
            this.draggingEnd.emit();
            this.adjustElements();
          }
        }),
        takeUntil(this.ngUnsubscribe)
      ).subscribe();
  }

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
   *
   * TODO doc markAsTouched
   * TODO doc disabled
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
    this.startCursorPosition = this.getEventClientX(event);
    if (element === this.selectedRange.nativeElement) {
      if (this.buttonLeft) {
        this.leftButtonOffset = this.getTranslateValueOf(this.buttonLeft.nativeElement);
      }
      this.rightButtonOffset = this.getTranslateValueOf(this.buttonRight.nativeElement);
    } else {
      this.elementOffset = this.getTranslateValueOf(this.draggingElement);
    }
  }

  /**
   *
   * */
  private getEventClientX(event: MouseEvent | TouchEvent): number {
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
   *    Then emits new buttons values if they has been changes
   *    and resizes highlighted range between buttons
   *
   *
   *    TODO doc emitValueWhileMoving
   */
  private onMouseMove(event: MouseEvent | TouchEvent) {
    if (this.draggingElement) {
      const clientX = this.getEventClientX(event);
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
   *    If left button is dragged
   *        then returns translate value of one step before right button
   *    If right button is dragged
   *        then returns translate value of one step after left button
   *
   * TODO doc!!! many docs
   * TODO refacto
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
      return this.getTranslateValueOf(this.buttonRight.nativeElement) - this.minimalSpaceBetweenButtons;
    }

    return this.getTranslateValueOf(this.buttonLeft?.nativeElement) + this.minimalSpaceBetweenButtons;
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
      return this.getTranslateValueOf(this.buttonRight.nativeElement) - futureButtonTranslation;
    }

    return futureButtonTranslation - this.getTranslateValueOf(this.buttonLeft?.nativeElement);

  }

  /**
   * Calls methods which emit shifted value according to dragging element
   * TODO doc
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
      this.fromChange.emit(this._from);
    }
  }

  /**
   * @param newHighValue
   *
   * If argument value is different than last emitted high value
   *    then sets and emits new low value, updates last emitted high value
   *
   * TODO doc value vs to
   */
  private emitHighValueIfHasBeenChanged(newHighValue: number): void {
    if  (this.lastEmittedToValue !== newHighValue) {
      // shift and emit highValue
      if (this.rangeSelector) {
        this.to = newHighValue;
        this.toChange.emit(this._to);
      } else {
        this.value = newHighValue;
        this.valueChange.emit(this._value);
      }
    }
  }

  /**
   * TODO doc
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
    this.draggingElement!.style.transform = this.getTranslateValueCenteredVertically(correctedTranslateValue);
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
      this.buttonLeft.nativeElement.style.transform = this.getTranslateValueCenteredVertically(leftButtonTranslation);
    }
    this.buttonRight.nativeElement.style.transform = this.getTranslateValueCenteredVertically(rightButtonTranslation);
  }

  /**
   * Minimal space between buttons is equal one step width
   * It protects user from selecting the same start and end date
   * It provides user possibility to select the smaller possible time frame equal step value
   *
   * TODO enableButtonOverlapping
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
    return Math.round(this.ceilValue * this.getTranslateValueOf(element) / (this.maximumTranslateValue));
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
  private getTranslateValueOf(element?: HTMLElement): number {
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
  private getTranslateValueCenteredVertically(translateValue: number): string {
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
      this.maximumTranslateValue = this.sliderBarWidth - this.BUTTON_WIDTH;
    }
  }

  /**
   * Places buttons respectively at the beginning and at the end of slider bar, if there is no translate value set yet;
   * Places buttons in proper places while window resizing or after range (ceil, low/high value) has been changed externally (not by sliding)
   */
  private placeButtons(): void {
    if (this.buttonLeft) {
      if (this.buttonLeft.nativeElement.style.transform) {
        this.buttonLeft.nativeElement.style.transform = this.getTranslateValueCenteredVertically(this.calculateTranslationFromValue(this._from));
      } else {
        this.buttonLeft.nativeElement.style.transform =  this.getTranslateValueCenteredVertically(0);
      }
    }

    if (this.buttonRight) {
      if (this.buttonRight.nativeElement.style.transform) {
        this.buttonRight.nativeElement.style.transform = this.getTranslateValueCenteredVertically(this.calculateTranslationFromValue(this.toOrValue));
      } else {
        this.buttonRight.nativeElement.style.transform = this.getTranslateValueCenteredVertically(this.maximumTranslateValue);
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
      this.selectedRange.nativeElement.style.transform = this.getTranslateValueCenteredVertically(this.getTranslateValueOf(this.buttonLeft?.nativeElement) + this.BUTTON_WIDTH / 2);
      this.selectedRange.nativeElement.style.width = `${this.getTranslateValueOf(this.buttonRight.nativeElement) - this.getTranslateValueOf(this.buttonLeft?.nativeElement)}px`;
    }
  }

  /**
   * TODO
   * */
  private getMaxValue(value: number): number {
    if (this.ceilValue < value) {
      console.error(`'to' value cannot be bigger than ceilValue.\nTrying set value of ${value}, cannot be more than ${this.ceilValue}`);
      return this.ceilValue;
    }
    return value;
  }

  /**
   * TODO
   * */
  private getMinValue(value: number): number {
    if (value < 0) {
      console.error(`'from' value cannot be smaller than 0.\nTrying set value of ${value}`);
      return 0;
    }
    return value;
  }

  /**
   * Method calls resize method and emits event informing parent component that slider is not touched yet
   * Method should be called after input values has been changed
   */
  private init(): void {
    if (this.resizeAfterTemplateIsReRendered) {
    /**
     * In case of slider bar width has been changed while setting new input value.
     * It is to be call after template is re-rendered to make sure that correct slider bar width is set.
     */
    setTimeout(() => this.resize());
    } else {
      this.resize();
    }
  }

  /**
   * Initializes slider bar width, places buttons in proper places and resizez selected range.
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
    this.ngUnsubscribe.next(null);
    this.ngUnsubscribe.complete();

    this.reactiveFormUnsubscribe.next(null);
    this.reactiveFormUnsubscribe.complete();
  }

  /**
   * TODO
   * */
  private onChange = (changes: SliderInputValue) => {};
  private onTouched = () => {};

  private touched = false;

  private markAsTouched() {
    if (!this.touched) {
      this.onTouched();
      this.touched = true;
    }
  }

  /**
   * TODO
   * */
  registerOnChange(onChange: any): void {
    this.onChange = onChange;
  }

  /**
   * TODO
   * */
  registerOnTouched(onTouched: any): void {
    this.onTouched = onTouched;
  }

  /**
   * TODO
   * */
  setDisabledState(disabled: boolean): void {
    this.disabled = disabled;
  }

  /**
   * TODO
   * */
  writeValue(value: SliderInputValue): void {
    if (value == null) {
      throw new Error(`Value cannot be ${value}`)
    }

    if (this.rangeSelector) {
      const _value = value as RangeInputValue;
      if (_value.to == null || _value.from == null) {
        throw new Error('Input has to be type of RangeInputValue ({from: number; to: number}) while in range value mode');
      } else {
        // TODO range value mode
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
  /**
   * TODO doc
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
 * TODO
 * */
function error(message: string) {

}

/**
 * TODO
 * */
type SliderInputValue = RangeInputValue | number

/**
 * TODO
 * */
interface RangeInputValue {
  from: number;
  to: number;
}
