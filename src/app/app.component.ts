import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { FormBuilder } from '@angular/forms';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent implements AfterViewInit{
  title = 'ngx-range-slider';

  to = 4;

  form = this.fb.group({
    // slider: 3,
    slider: {
      from: 3,
      to: 4
    }
  });

  constructor(private fb: FormBuilder, private cdr: ChangeDetectorRef) {
    this.form.valueChanges.subscribe(changes => console.log(changes));
    // this.form.disable()
  }

  thirdValues = ["#6200ea","#6000e6","#5e00e1","#5c00dd","#5a00d9","#5800d5","#5600d1","#5400cc","#5200c8","#5000c4","#4e00c0","#4c00bc","#4900b7","#4700b3","#4500af","#4300ab","#4100a6","#3f00a2","#3d009e","#3b009a","#390096","#370091","#35008d","#330089","#310085","#2f0081","#2d007c","#2b0078","#290074","#270070","#25006c","#230067","#210063","#1f005f","#1d005b","#1b0057","#180052","#16004e","#14004a","#120046","#100041","#0e003d","#0c0039","#0a0035","#080031","#06002c","#040028"];


  thirdFrom = 5;
  thirdTo = 30;

  fourthFrom = 5;
  fourthTo = 30;


  fifthValue = 2137;

  ngAfterViewInit(): void {
    this.cdr.markForCheck();
  }
}
