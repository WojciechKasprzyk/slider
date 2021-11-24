import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormBuilder } from '@angular/forms';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {
  title = 'ngx-range-slider';

  to = 4;

  form = this.fb.group({
    // slider: 3,
    slider: {
      from: 3,
      to: 3
    }
  });

  constructor(private fb: FormBuilder) {
    this.form.valueChanges.subscribe(changes => console.log(changes));
    // this.form.disable()
  }
}
