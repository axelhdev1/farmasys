import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ClientesService } from './clientes.service';
import { ActualizarClienteDto, CrearClienteDto } from './dto/cliente.dto';

@ApiTags('clientes')
@ApiBearerAuth('access-token')
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Post()
  @ApiOperation({ summary: 'Crear cliente (valida DNI/RUC)' })
  crear(@Body() dto: CrearClienteDto) {
    return this.clientes.crear(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos los clientes (padrón)' })
  listar() {
    return this.clientes.listar();
  }

  @Get('buscar')
  @ApiOperation({ summary: 'Buscar clientes por documento o nombre' })
  @ApiQuery({ name: 'q', required: true })
  buscar(@Query('q') q: string) {
    return this.clientes.buscar(q);
  }

  @Get('documento/:tipo/:numero')
  @ApiOperation({ summary: 'Obtener cliente por tipo y número de documento' })
  porDocumento(@Param('tipo') tipo: string, @Param('numero') numero: string) {
    return this.clientes.porDocumento(tipo, numero);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener cliente por id' })
  obtener(@Param('id') id: string) {
    return this.clientes.obtener(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar cliente' })
  actualizar(@Param('id') id: string, @Body() dto: ActualizarClienteDto) {
    return this.clientes.actualizar(id, dto);
  }
}
