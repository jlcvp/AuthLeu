import { inject, NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomePage } from './home.page';
import { AuthenticationService } from '../services/authentication.service';

const routes: Routes = [
  {
    path: '',
    component: HomePage,
    canActivate: [() => inject(AuthenticationService).canActivate()],
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class HomePageRoutingModule {}
