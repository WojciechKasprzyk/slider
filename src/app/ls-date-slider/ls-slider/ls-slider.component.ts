import {
  AfterViewInit, ChangeDetectionStrategy,
  Component,
  ElementRef, EventEmitter, HostListener, Input,
  OnDestroy,
  Output,
  ViewChild
} from '@angular/core';
import { fromEvent, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'ls-slider',
  templateUrl: './ls-slider.component.html',
  styleUrls: ['./ls-slider.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LsSliderComponent implements AfterViewInit, OnDestroy {
  /**
   * Stores currently dragging element - left button, right button or selected range (it means both buttons)
   */
  draggingElement: HTMLElement | null;

  /**
   * TOTAL STEPS
   * Maximum possible value
   */
  private _ceilValue: number;

  /**
   * Store buttons current values
   */
  private _lowValue = 0;
  private _highValue = 0;

  /**
   * Store buttons last emitted values
   */
  private lastEmittedLowValue = 0;
  private lastEmittedHighValue = 0;

  /**
   * CONSTANT property
   * Because of space-evenly, it's 5px * 3 + 2 * span.width
   */
  readonly BUTTON_WIDTH = 17;

  /**
   * Stores clientX mouse position on mouseDown event (when mouse moving starts)
   */
  private startCursorPosition: number;

  /**
   * Is Set in initializeSliderBarSizes method.
   * Is used to calculate maximum translate value
   */
  private sliderBarWidth: number;

  /**
   * Initially buttons are placed at the beginning of slider bar (translate 0px)
   * The high value button can be moved to the end of slider bar.
   * To keep experience visually consistent its value is equal to the difference between slider bar width and button width.
   * Calculated in initializeSliderBarSizes method.
   */
  private maximumTranslateValue: number;

  /**
   * -Offset properties store respectively their elements initial position when mouseDown event occurs (when mouse moving starts)
   * elementOffset is used when single button is dragging
   * left- and rightButtonOffset are used when both buttons are dragging (selected range is dragging)
   */
  private elementOffset: number;
  private leftButtonOffset: number;
  private rightButtonOffset: number;

  private readonly ngUnsubscribe = new Subject();
  private readonly mouseUp = fromEvent(document, 'mouseup');

  /**
   * Used in init method to make sure that correct slider bar width is set.
   * Needed only if slider bar width changes while setting new input value.
   */
  @Input() resizeAfterTemplateIsReRendered = false;

  @Input() set ceilValue(val: number) {
    this._ceilValue = val;
    this.init();
  }

  /**
   * Emit button values when they has been changed
   */
  @Output() readonly lowValueChange = new EventEmitter();
  @Output() readonly highValueChange = new EventEmitter();

  /**
   * Emits on mouse up event (dragging end)
   */
  @Output() readonly draggingEnd = new EventEmitter();

  /**
   * HTML elements - both buttons, slider bar which buttons are placed on and highlighted range between buttons
   */
  @ViewChild('buttonLeft') private readonly buttonLeft: ElementRef;
  @ViewChild('buttonRight') private readonly buttonRight: ElementRef;
  @ViewChild('sliderBar') private readonly sliderBar: ElementRef;
  @ViewChild('selectedRange') private readonly selectedRange: ElementRef;

  get ceilValue(): number {
    return this._ceilValue;
  }

  constructor() {
    /**
     * Subscribe to mouseUp event - dragging end
     */
    this.mouseUp
      .pipe(takeUntil(this.ngUnsubscribe))
      .subscribe(event => {
        if (this.draggingElement) {
          this.draggingElement = null;
          this.draggingEnd.emit();
          this.adjustElements();
        }
      });
  }

  /**
   * Updates low and high value and
   * calls init method to resize slider elements.
   */
  updateValues(lowValue: number, highValue: number): void {
    this._lowValue = lowValue;
    this.lastEmittedLowValue = lowValue;

    this._highValue = highValue;
    this.lastEmittedHighValue = highValue;

    this.init();
  }

  /**
   * @param element - left/right button or selectedRange
   * selectedRange stands for both buttons
   */
  mouseDownHandler(event: MouseEvent, element: HTMLElement): void {
    this.draggingElement = element;
    this.startCursorPosition = event.clientX;
    if (element === this.selectedRange.nativeElement) {
      this.leftButtonOffset = this.getTranslateValueOf(this.buttonLeft.nativeElement);
      this.rightButtonOffset = this.getTranslateValueOf(this.buttonRight.nativeElement);
    } else {
      this.elementOffset = this.getTranslateValueOf(this.draggingElement);
    }
  }

  /**
   * @param clientX - property of MouseEvent object.
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
   */
  private readonly onMouseMove = ({clientX}: MouseEvent) => {
    if (this.draggingElement) {
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
      this.emitShiftedValues();
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
   */
  private correctTranslateValueAccordingToAnotherButton(translateValue: number): number {
    const futureSpaceBetweenButtons = this.calculateFutureButtonsDistanceDifference(translateValue);
    if (futureSpaceBetweenButtons > this.minimalSpaceBetweenButtons) {
      return translateValue;
    }

    if (this.draggingElement === this.buttonLeft.nativeElement) {
      return this.getTranslateValueOf(this.buttonRight.nativeElement) - this.minimalSpaceBetweenButtons;
    }

    return this.getTranslateValueOf(this.buttonLeft.nativeElement) + this.minimalSpaceBetweenButtons;

  }

  /**
   * @param futureButtonTranslation - translate value to be set
   * Predicts what would distance between buttons be, if argument value was applied
   */
  private calculateFutureButtonsDistanceDifference(futureButtonTranslation: number): number {
    if (this.draggingElement === this.buttonLeft.nativeElement) {
      return this.getTranslateValueOf(this.buttonRight.nativeElement) - futureButtonTranslation;
    }

    return futureButtonTranslation - this.getTranslateValueOf(this.buttonLeft.nativeElement);

  }

  /**
   * Calls methods which emit shifted value according to dragging element
   */
  private emitShiftedValues(): void {
    if (this.draggingElement === this.selectedRange.nativeElement) {
      this.emitBothShiftedValues();
    } else {
      const shiftedValue = this.calculateValueFromTranslation(this.draggingElement);
      if (this.draggingElement === this.buttonLeft.nativeElement) {
        this.emitLowValueIfHasBeenChanged(shiftedValue);
      } else {
        this.emitHighValueIfHasBeenChanged(shiftedValue);
      }
    }
  }

  /**
   * @param newLowValue
   *
   * If argument value is different than last emitted low value
   *    then sets and emits new low value, updates last emitted low value
   */
  private emitLowValueIfHasBeenChanged(newLowValue: number): void {
    if (this.lastEmittedLowValue !== newLowValue) {
      // shift and emit lowValue
      this._lowValue = newLowValue;
      this.lastEmittedLowValue = newLowValue;
      this.lowValueChange.emit(this._lowValue);
    }
  }

  /**
   * @param newHighValue
   *
   * If argument value is different than last emitted high value
   *    then sets and emits new low value, updates last emitted high value
   */
  private emitHighValueIfHasBeenChanged(newHighValue: number): void {
    if  (this.lastEmittedHighValue !== newHighValue) {
      // shift and emit highValue
      this._highValue = newHighValue;
      this.lastEmittedHighValue = newHighValue;
      this.highValueChange.emit(this._highValue);
    }
  }

  /**
   * Calculates new low and high values and emits them if they are different than their last emitted values
   */
  private emitBothShiftedValues(): void {
    const newLowValue =  this.calculateValueFromTranslation(this.buttonLeft.nativeElement);
    const newHighValue =  this.calculateValueFromTranslation(this.buttonRight.nativeElement);
    this.emitLowValueIfHasBeenChanged(newLowValue);
    this.emitHighValueIfHasBeenChanged(newHighValue);
  }

  /**
   * Moves buttons to current step positions
   * Resizes selected Range after moving
   */
  private adjustElements(): void {
    this.moveBothButtons(this.calculateTranslationFromValue(this._lowValue), this.calculateTranslationFromValue(this._highValue));
    this.resizeSelectedRange();
  }

  /**
   * @param translateValue - translation value in pixels
   *
   * Validates argument and translates currently dragging button
   */
  private moveButton(correctedTranslateValue: number): void {
    this.draggingElement.style.transform = this.getTranslateValueCenteredVertically(correctedTranslateValue);
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
    this.buttonLeft.nativeElement.style.transform = this.getTranslateValueCenteredVertically(leftButtonTranslation);
    this.buttonRight.nativeElement.style.transform = this.getTranslateValueCenteredVertically(rightButtonTranslation);
  }

  /**
   * Minimal space between buttons is equal one step width
   * It protects user from selecting the same start and end date
   * It provides user possibility to select the smaller possible time frame equal step value
   */
  private get minimalSpaceBetweenButtons(): number {
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
  private getTranslateValueOf(element: HTMLElement): number {
    return +element.style.transform.slice(10, -9);
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
    if (this.buttonRight && this.buttonLeft) {
      if (this.buttonRight.nativeElement.style.transform && this.buttonLeft.nativeElement.style.transform) {
        this.buttonLeft.nativeElement.style.transform = this.getTranslateValueCenteredVertically(this.calculateTranslationFromValue(this._lowValue));
        this.buttonRight.nativeElement.style.transform = this.getTranslateValueCenteredVertically(this.calculateTranslationFromValue(this._highValue));
      } else {
        this.buttonLeft.nativeElement.style.transform =  this.getTranslateValueCenteredVertically(0);
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
      this.selectedRange.nativeElement.style.transform = this.getTranslateValueCenteredVertically(this.getTranslateValueOf(this.buttonLeft.nativeElement) + this.BUTTON_WIDTH / 2);
      this.selectedRange.nativeElement.style.width = `${this.getTranslateValueOf(this.buttonRight.nativeElement) - this.getTranslateValueOf(this.buttonLeft.nativeElement)}px`;
    }
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
    /**
     * Component is listening on whole document to provide user possibility
     * to dragging buttons over document, not only over this component (slider bar).
     */
    fromEvent(document, 'mousemove')
      .pipe(takeUntil(this.ngUnsubscribe))
      .subscribe(this.onMouseMove);
  }

  ngOnDestroy(): void {
    this.ngUnsubscribe.next();
    this.ngUnsubscribe.complete();
  }
}
