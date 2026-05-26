import sql from "@/app/api/utils/sql";

export async function PUT(request, { params: { id } }) {
  try {
    const body = await request.json();
    const { name, is_base_material, market_price } = body;

    const setClauses = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      setClauses.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (is_base_material !== undefined) {
      setClauses.push(`is_base_material = $${paramCount++}`);
      values.push(is_base_material);
    }
    if (market_price !== undefined) {
      setClauses.push(`market_price = $${paramCount++}`);
      values.push(market_price);
    }

    if (setClauses.length === 0) {
      return Response.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(id);
    const rows = await sql(
      `UPDATE items SET ${setClauses.join(", ")} WHERE id = $${paramCount} RETURNING *`,
      values,
    );
    return Response.json({ item: rows[0] });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to update item" }, { status: 500 });
  }
}

export async function DELETE(request, { params: { id } }) {
  try {
    await sql`DELETE FROM items WHERE id = ${id}`;
    return Response.json({ success: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to delete item" }, { status: 500 });
  }
}
