import { Component, ElementRef, Input, OnChanges, OnInit, ViewChild } from '@angular/core';
import { ImageStroke, StrokeMethodFactory } from 'image-stroke-v2'
import { AppConfigService } from 'src/app/services/app-config.service';

@Component({
  selector: 'app-stroked-img',
  templateUrl: './stroked-img.component.html',
  styleUrls: ['./stroked-img.component.scss'],
})
export class StrokedImgComponent implements OnChanges, OnInit {

  // img source input
  @Input() src: string = ""
  @ViewChild('canvasRef') canvasRef!: ElementRef<HTMLCanvasElement>

  private initialized = false
  // This component is used to display a stroked image
  constructor() { }

  ngOnChanges(): void {
    if (this.initialized) { 
      this.loadImageAndDraw()
    }
  }

  ngOnInit() {
    this.loadImageAndDraw()
  }

  private loadImageAndDraw() {
    const image = new Image()
    //image.crossOrigin = 'anonymous' // Allow CORS if needed
    image.src = this.src

    image.onload = () => {
      const canvas = this.canvasRef.nativeElement
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        console.warn('Could not get canvas context')
        return
      }

      const isDarkMode = AppConfigService.isUsingDarkMode()
      // we'll need to apply the stroke only on dark mode as the logos are already optimized for light mode
      if (!isDarkMode) {
        canvas.width = image.width
        canvas.height = image.height
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(image, 0, 0)
        this.initialized = true
        return
      }

      // Set canvas size to image size
      const strokeWidth = 2
      canvas.width = image.width + 2 * strokeWidth + 2
      canvas.height = image.height + 2 * strokeWidth + 2
      const rotateMethod = StrokeMethodFactory.rotate()
      
      const imageStroke = new ImageStroke(rotateMethod)
      const strokeColor = 'white'
      console.log('Using stroke color:', strokeColor)
      const canvasData = imageStroke.make(image, {
        thickness: strokeWidth,
        color: strokeColor
      })

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(canvasData, 0, 0)
      this.initialized = true
    }
  }

}
