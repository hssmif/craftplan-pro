import { NextRequest, NextResponse } from 'next/server';
import { createProduct, getAllProducts, getProduct, updateProduct, deleteProduct } from '@/lib/db';

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type') || undefined;
  const id = request.nextUrl.searchParams.get('id');

  if (id) {
    const product = getProduct(Number(id));
    if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(product);
  }

  const products = getAllProducts(type);
  return NextResponse.json(products);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const product = createProduct(body);
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const product = updateProduct(Number(id), data);
    if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json(product);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const deleted = deleteProduct(Number(id));
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true });
}
