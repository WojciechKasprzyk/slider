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

  thirdValues = ["#00d0fb","#00ccf6","#00c8f2","#00c3ee","#00bfea","#00bbe5","#00b7e1","#00b3dd","#00afd8","#00aad4","#00a6d0","#00a2cb","#019ec7","#019ac3","#0196bf","#0191ba","#018db6","#0189b2","#0185ad","#0181a9","#017da5","#0179a1","#01749c","#017098","#016c94","#01688f","#01648b","#016087","#015b82","#01577e","#01537a","#014f76","#014b71","#01476d","#014369","#013e64","#013a60","#01365c","#023258","#022e53","#022a4f","#02254b","#022146","#021d42","#02193e","#021539","#021135","#020c31","#02082d","#020428"];


  thirdFrom = 5;
  thirdTo = 30;

  fourthFrom = 5;
  fourthTo = 30;


  fifthValue = 2137;

  ngAfterViewInit(): void {
    this.cdr.markForCheck();
  }
}
