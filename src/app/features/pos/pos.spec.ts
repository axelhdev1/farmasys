import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PosComponent } from './pos';

describe('PosComponent', () => {
  let fixture: ComponentFixture<PosComponent>;
  let component: PosComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PosComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with empty cart', () => {
    expect((component as any).carrito().length).toBe(0);
  });

  it('should add product to cart', () => {
    const cmp = component as any;
    const producto = cmp.productos()[0];
    cmp.agregarProducto(producto);
    expect(cmp.carrito().length).toBe(1);
    expect(cmp.carrito()[0].cantidad).toBe(1);
  });

  it('should increment quantity when adding existing product', () => {
    const cmp = component as any;
    const producto = cmp.productos()[0];
    cmp.agregarProducto(producto);
    cmp.agregarProducto(producto);
    expect(cmp.carrito().length).toBe(1);
    expect(cmp.carrito()[0].cantidad).toBe(2);
  });

  it('should compute totals correctly with IGV', () => {
    const cmp = component as any;
    const producto = { ...cmp.productos()[0], precioVenta: 118 };
    cmp.agregarProducto(producto);
    const t = cmp.totales();
    expect(t.total).toBe(118);
    expect(t.subtotal).toBe(100);
    expect(t.igv).toBe(18);
  });
});
